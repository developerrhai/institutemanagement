const axios = require("axios");
const db = require("../config/db");
const notificationService = require("./notificationService");
const { getSmartOfficeConfig, timeToMinutes } = require("./smartOffice.service");

let lastLogTime = null; // store last processed punch
let isFirstRun = true;  // skip sending notifications on startup for historical logs today
let isProcessing = false; // lock to prevent overlapping runs

function todayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function checkNewPunches() {
  if (isProcessing) {
    console.log("[SmartOfficeWatcher] Already processing a batch, skipping this run...");
    return;
  }

  try {
    isProcessing = true;
    const config = getSmartOfficeConfig();

    const today = todayDate();
    let url =
      `${config.baseUrl}/api/v2/WebAPI/GetDeviceLogs` +
      `?APIKey=${config.apiKey}` +
      `&FromDate=${today}` +
      `&ToDate=${today}`;
      
    if (config.serialNumber) {
      url += `&SerialNumber=${config.serialNumber}`;
    }

    const res = await axios.get(url, { timeout: 15000 });

    const rawLogs = Array.isArray(res.data) ? res.data : (res.data?.data || []);

    const logs = rawLogs.filter((log) => log.LogDate || log.DateTime).sort((a, b) => {
      const dateA = new Date((a.LogDate || a.DateTime).replace(" ", "T"));
      const dateB = new Date((b.LogDate || b.DateTime).replace(" ", "T"));
      return dateA - dateB;
    });

    if (isFirstRun) {
      isFirstRun = false;
      if (logs.length > 0) {
        lastLogTime = logs[logs.length - 1].LogDate || logs[logs.length - 1].DateTime;
        console.log(`[SmartOfficeWatcher] Initialized lastLogTime on startup to: ${lastLogTime}`);
      } else {
        console.log("[SmartOfficeWatcher] No logs found today yet. Initialized lastLogTime to null");
      }
      return;
    }

    for (const log of logs) {
      const logTime = log.LogDate || log.DateTime;

      // skip old logs
      if (lastLogTime && new Date(logTime.replace(" ", "T")) <= new Date(lastLogTime.replace(" ", "T"))) {
        continue;
      }

      lastLogTime = logTime;

      try {
        const studentCode = String(log.EmployeeCode).trim();
        const [students] = await db.query(
          "SELECT id, name FROM students WHERE TRIM(biometric_code) = ? AND deleted_at IS NULL",
          [studentCode]
        );

        if (students && students.length > 0) {
          const student = students[0];
          
          // Determine punch direction (In/Out) dynamically based on punch count today
          const studentPunches = logs
              .filter((l) => String(l.EmployeeCode).trim() === studentCode)
              .sort((a, b) => {
                const dateA = new Date((a.LogDate || a.DateTime).replace(" ", "T"));
                const dateB = new Date((b.LogDate || b.DateTime).replace(" ", "T"));
                return dateA - dateB;
              });

          const punchIndex = studentPunches.findIndex(
            (l) => (l.LogDate || l.DateTime) === (log.LogDate || log.DateTime)
          );

          // Even index (0, 2, 4...) -> Entry (0), Odd index (1, 3, 5...) -> Exit (1)
          const isEntry = (punchIndex !== -1 && punchIndex % 2 === 0);

          // Look up mapped batches for student
          const [assignedBatches] = await db.query(
            `SELECT b.* FROM batches b JOIN student_batches sb ON b.batch_id = sb.batch_id WHERE sb.student_id = ?`,
            [student.id]
          );

          const logTimeOnly = logTime.split(" ")[1];
          const pMin = timeToMinutes(logTimeOnly);

          let matchedBatch = null;
          for (const b of assignedBatches) {
            const sMin = timeToMinutes(b.start_time);
            const eMin = timeToMinutes(b.end_time);
            if (pMin >= sMin - 30 && pMin <= eMin + 30) {
              matchedBatch = b;
              break;
            }
          }

          if (matchedBatch && matchedBatch.scheduled_days) {
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const todayDay = dayNames[new Date().getDay()];
            const days = matchedBatch.scheduled_days.split(",").map((d) => d.trim());
            if (!days.includes(todayDay)) {
              console.log(`[SmartOfficeWatcher] Skipping notification: Batch ${matchedBatch.batch_name} is not scheduled on ${todayDay}`);
              continue;
            }
          }

          let title = "Attendance Update";
          let body = "";

          if (isEntry) {
            if (matchedBatch) {
              const sMin = timeToMinutes(matchedBatch.start_time);
              const grace = matchedBatch.late_grace_minutes ?? 10;
              const isLate = pMin > sMin + grace;
              
              if (isLate) {
                title = "Late Punch-In";
                body = `${student.name} arrived late for ${matchedBatch.batch_name} at ${logTimeOnly}.`;
              } else {
                title = "Punch-In Successful";
                body = `${student.name} arrived for ${matchedBatch.batch_name} at ${logTimeOnly}.`;
              }
            } else {
              title = "Punch-In Successful";
              body = `${student.name} punched in at ${logTimeOnly}.`;
            }
          } else {
            if (matchedBatch) {
              title = "Punch-Out Successful";
              body = `${student.name} exited after ${matchedBatch.batch_name} at ${logTimeOnly}.`;
            } else {
              title = "Punch-Out Successful";
              body = `${student.name} punched out at ${logTimeOnly}.`;
            }
          }

          // Trigger Firebase notification
          console.log(`[SmartOfficeWatcher] Sending Firebase Notification to Student ID ${student.id}: ${title} - ${body}`);
          
          try {
            await notificationService.sendToUser(
              student.id,
              "STUDENT",
              title,
              body,
              null, // sentBy
              "SYSTEM", // sentByRole
              { type: "attendance", date: today, time: logTimeOnly }
            );
          } catch (notifErr) {
            // Will fail gracefully if user has no FCM token registered
            console.error(`[SmartOfficeWatcher] Notification skipped for student ${student.id}:`, notifErr.message);
          }
        } else {
          console.log(`[SmartOfficeWatcher] Student not found in database for biometric code: ${studentCode}`);
        }
      } catch (dbErr) {
        console.error(`[SmartOfficeWatcher] DB Lookup Error for code ${log.EmployeeCode}:`, dbErr.message);
      }

      await new Promise((r) => setTimeout(r, 100)); // Delay to prevent spam
    }
  } catch (err) {
    console.log("[SmartOfficeWatcher] Error:", err.message);
  } finally {
    isProcessing = false;
  }
}

function startWatcher() {
  // Run every 30 seconds
  setInterval(checkNewPunches, 30000);

  // Run once on startup after a short delay
  setTimeout(checkNewPunches, 5000);

  console.log("[SmartOfficeWatcher] ✅ Attendance watcher started (polling every 30s)");
}

module.exports = { startWatcher, checkNewPunches };
