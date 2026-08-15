const db = require("../config/db");

// Configuration loaded dynamically from env to support the key injection strategy
const getSmartOfficeConfig = () => {
  const baseUrl = process.env.SMARTOFFICE_BASE_URL;
  const apiKey = process.env.SMARTOFFICE_API_KEY;
  const serialNumber = process.env.SMARTOFFICE_SERIAL_NUMBER;

  const isConfigured = !!(baseUrl && apiKey && serialNumber);

  return {
    baseUrl: baseUrl || "http://13.232.199.167",
    apiKey: apiKey || "385619062612",
    serialNumber: serialNumber || "AMDB25121401560",
    isConfigured
  };
};

/**
 * Fetch raw biometric logs from the hardware device via Smart Office API.
 */
async function fetchBiometricLogs(fromDate, toDate) {
  const config = getSmartOfficeConfig();
  
  if (!config.isConfigured) {
    console.warn("[SmartOffice] Service is running with placeholder/default keys. Sync might be pending configuration.");
  }

  const params = new URLSearchParams({
    APIKey: config.apiKey,
    FromDate: fromDate,
    ToDate: toDate,
    SerialNumber: config.serialNumber,
  });

  const url = `${config.baseUrl}/api/v2/WebAPI/GetDeviceLogs?${params}`;
  console.log(`[SmartOffice] Fetching device logs from: ${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Smart Office API responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      if (data?.status === false) {
        throw new Error(data.message || "Smart Office API Error response");
      }
      throw new Error("Unexpected response format from Smart Office API");
    }

    return data;
  } catch (error) {
    console.error("[SmartOffice] Fetch logs failed:", error.message);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converts Time string (HH:MM:SS) to minutes of day
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  return h * 60 + m;
}

/**
 * Parse log date correctly
 */
function parseLogDate(logDate) {
  return new Date(logDate.replace(" ", "T"));
}

/**
 * Format date object to HH:MM time
 */
function formatTime(date) {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Processes raw device logs and computes attendance status for all students and teachers
 * based on their mapped batches. Saves/upserts records in the 'attendance' table.
 */
async function syncBiometricAttendance(date) {
  const config = getSmartOfficeConfig();
  
  // 1. Fetch raw logs
  let logs = [];
  try {
    logs = await fetchBiometricLogs(date, date);
  } catch (err) {
    throw new Error(`Biometric sync failed: ${err.message}. Please check your hardware connectivity or API config.`);
  }

  // Group raw logs by EmployeeCode
  const logsByCode = new Map();
  for (const log of logs) {
    const code = String(log.EmployeeCode).trim();
    if (!logsByCode.has(code)) logsByCode.set(code, []);
    logsByCode.get(code).push(log);
  }

  // 2. Fetch all active students and teachers with biometric codes
  const [students] = await db.query(
    "SELECT id, name, biometric_code, standard, course FROM students WHERE deleted_at IS NULL"
  );
  const [teachers] = await db.query(
    "SELECT id, name, biometric_code FROM teachers"
  );

  // Load student batch mappings
  const [studentMappings] = await db.query(
    `SELECT sb.student_id, sb.batch_id, b.batch_name as name, b.start_time, b.end_time, b.late_grace_minutes 
     FROM student_batches sb
     JOIN batches b ON sb.batch_id = b.batch_id`
  );
  const studentBatchesMap = new Map();
  for (const m of studentMappings) {
    if (!studentBatchesMap.has(m.student_id)) studentBatchesMap.set(m.student_id, []);
    studentBatchesMap.get(m.student_id).push(m);
  }

  // Load teacher batch mappings (handling string representation in teacher_batches as well as direct mapping)
  const [teacherMappings] = await db.query(
    `SELECT tbm.teacher_id, tbm.batch_id, b.batch_name as name, b.start_time, b.end_time, b.late_grace_minutes 
     FROM teacher_batch_mappings tbm
     JOIN batches b ON tbm.batch_id = b.batch_id`
  );
  const teacherBatchesMap = new Map();
  for (const m of teacherMappings) {
    if (!teacherBatchesMap.has(m.teacher_id)) teacherBatchesMap.set(m.teacher_id, []);
    teacherBatchesMap.get(m.teacher_id).push(m);
  }

  const defaultBatch = {
    batch_id: null,
    name: "General Batch",
    start_time: "09:00:00",
    end_time: "17:00:00",
    late_grace_minutes: 15,
  };

  const processedRecords = [];

  // Helper to compute user sessions and save attendance
  const processUser = async (user, role, userBatches) => {
    const code = String(user.biometric_code || "").trim();
    if (!code) return; // User has no biometric code mapped

    const userLogs = logsByCode.get(code) || [];
    const activeBatches = userBatches.length > 0 ? userBatches : [defaultBatch];

    // Sort batches by start time
    const sortedBatches = [...activeBatches].sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
    );

    // Group batches into contiguous sessions (time difference <= 180 minutes)
    const sessions = [];
    let currentSession = [];

    for (let i = 0; i < sortedBatches.length; i++) {
      const batch = sortedBatches[i];
      if (currentSession.length === 0) {
        currentSession.push(batch);
      } else {
        const lastBatch = currentSession[currentSession.length - 1];
        const lastEnd = timeToMinutes(lastBatch.end_time);
        const currentStart = timeToMinutes(batch.start_time);

        if (currentStart - lastEnd <= 180) {
          currentSession.push(batch);
        } else {
          sessions.push(currentSession);
          currentSession = [batch];
        }
      }
    }
    if (currentSession.length > 0) sessions.push(currentSession);

    // Process each session
    for (const session of sessions) {
      const firstBatch = session[0];
      const lastBatch = session[session.length - 1];

      const sSessionMin = timeToMinutes(firstBatch.start_time);
      const eSessionMin = timeToMinutes(lastBatch.end_time);

      // Filter logs for the entire session window
      const sessionLogs = userLogs
        .filter((log) => {
          const logTime = log.LogDate || log.DateTime;
          if (!logTime) return false;
          const logTimePart = logTime.split(" ")[1];
          const pMin = timeToMinutes(logTimePart);
          return pMin >= sSessionMin - 30 && pMin <= eSessionMin + 30;
        })
        .sort((a, b) => {
          const timeA = parseLogDate(a.LogDate || a.DateTime).getTime();
          const timeB = parseLogDate(b.LogDate || b.DateTime).getTime();
          return timeA - timeB;
        });

      const sessionPunchIn = sessionLogs.length > 0 ? sessionLogs[0] : null;
      const sessionPunchOut = sessionLogs.length > 1 ? sessionLogs[sessionLogs.length - 1] : null;

      for (const batch of session) {
        const batchId = batch.batch_id;
        const sMin = timeToMinutes(batch.start_time);
        const eMin = timeToMinutes(batch.end_time);
        const grace = batch.late_grace_minutes ?? 10;

        let status = "Absent";
        let punchIn = null;
        let punchOut = null;
        let referenceId = null;

        if (sessionPunchIn) {
          const pInTime = (sessionPunchIn.LogDate || sessionPunchIn.DateTime).split(" ")[1];
          const pInMin = timeToMinutes(pInTime);

          if (pInMin <= eMin) {
            status = pInMin <= sMin + grace ? "Present" : "Late";
            punchIn = formatTime(parseLogDate(sessionPunchIn.LogDate || sessionPunchIn.DateTime));
            referenceId = sessionPunchIn.SerialNumber || config.serialNumber;
          }
        }

        if (sessionPunchOut) {
          const pOutTime = (sessionPunchOut.LogDate || sessionPunchOut.DateTime).split(" ")[1];
          const pOutMin = timeToMinutes(pOutTime);

          if (pOutMin > sMin) {
            punchOut = formatTime(parseLogDate(sessionPunchOut.LogDate || sessionPunchOut.DateTime));
          }
        }

        // Save to DB (only if not manually edited/override)
        // Check if there is an existing manual override in attendance table
        const [existing] = await db.query(
          "SELECT source, status FROM attendance WHERE user_id = ? AND date = ? AND role = ? AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))",
          [user.id, date, role, batchId, batchId]
        );

        // If manual override exists, preserve it; otherwise upsert biometric record
        if (existing.length === 0 || existing[0].source === "Smart Office") {
          await db.query(
            `INSERT INTO attendance (user_id, role, date, punch_in_time, punch_out_time, status, source, smart_office_reference_id, batch_id)
             VALUES (?, ?, ?, ?, ?, ?, 'Smart Office', ?, ?)
             ON DUPLICATE KEY UPDATE 
               punch_in_time = VALUES(punch_in_time),
               punch_out_time = VALUES(punch_out_time),
               status = VALUES(status),
               source = 'Smart Office',
               smart_office_reference_id = VALUES(smart_office_reference_id)`,
            [user.id, role, date, punchIn, punchOut, status, referenceId, batchId]
          );
        }

        processedRecords.push({
          userId: user.id,
          name: user.name,
          role,
          date,
          punchIn,
          punchOut,
          status: existing.length > 0 && existing[0].source === "Manual" ? existing[0].status : status,
          source: existing.length > 0 && existing[0].source === "Manual" ? "Manual" : "Smart Office",
          batchName: batch.name,
          batchId
        });
      }
    }
  };

  // Process all students
  for (const s of students) {
    const sBatches = studentBatchesMap.get(s.id) || [];
    await processUser(s, "STUDENT", sBatches);
  }

  // Process all teachers
  for (const t of teachers) {
    const tBatches = teacherBatchesMap.get(t.id) || [];
    await processUser(t, "TEACHER", tBatches);
  }

  return processedRecords;
}

module.exports = {
  getSmartOfficeConfig,
  fetchBiometricLogs,
  syncBiometricAttendance,
  timeToMinutes
};
