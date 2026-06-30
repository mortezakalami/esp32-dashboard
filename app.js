const API = "https://esp32-api.kalamidev.workers.dev";

let tempChart, humChart;
let currentRange = '1h';
let realtimeTimer = null;
let realtimeIntervalMs = 3000;

// ===== توابع کمکی =====
function formatUptime(seconds) {
  if (!seconds) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d} روز و ${h} ساعت و ${m} دقیقه`;
}

function calcHeatIndex(tempC, hum) {
  if (tempC == null || hum == null) return null;
  const T = tempC * 9/5 + 32;
  const HI = -42.379 + 2.04901523*T + 10.14333127*hum 
             - 0.22475541*T*hum - 0.00683783*T*T 
             - 0.05481717*hum*hum + 0.00122874*T*T*hum 
             + 0.00085282*T*hum*hum - 0.00000199*T*T*hum*hum;
  return (HI - 32) * 5/9;
}

function calcDewPoint(tempC, hum) {
  if (tempC == null || hum == null) return null;
  const a = 17.27, b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(hum / 100);
  return (b * alpha) / (a - alpha);
}

// ===== بارگذاری داده‌های لحظه‌ای =====
async function loadRealtime() {
  try {
    const r = await fetch(API + "/realtime/latest");
    const data = await r.json();
    if (!data || data.temperature == null) return;

    const temp = data.temperature;
    const hum = data.humidity;

    document.getElementById("temperature").innerHTML = temp.toFixed(1) + ' <span class="unit">°C</span>';
    document.getElementById("humidity").innerHTML = hum.toFixed(1) + ' <span class="unit">%</span>';

    const hi = calcHeatIndex(temp, hum);
    const dp = calcDewPoint(temp, hum);
    document.getElementById("heatIndex").innerText = hi != null ? hi.toFixed(1) : '--';
    document.getElementById("dewPoint").innerText = dp != null ? dp.toFixed(1) : '--';
  } catch (e) {
    console.error("loadRealtime error:", e);
  }
}

// ===== بارگذاری آخرین داده تاریخی (برای uptime) =====
async function loadLatest() {
  try {
    const r = await fetch(API + "/latest");
    const data = await r.json();
    if (data && data.uptime != null) {
      document.getElementById("uptime").innerText = formatUptime(data.uptime);
    }
  } catch (e) {
    console.error("loadLatest error:", e);
  }
}

// ===== بارگذاری آمار روزانه =====
async function loadStats() {
  try {
    const r = await fetch(API + "/stats");
    const stats = await r.json();
    if (stats.temp) {
      document.getElementById("tempMin").innerText = stats.temp.min != null ? stats.temp.min.toFixed(1) + '°' : '--';
      document.getElementById("tempMax").innerText = stats.temp.max != null ? stats.temp.max.toFixed(1) + '°' : '--';
      document.getElementById("tempAvg").innerText = stats.temp.avg != null ? stats.temp.avg.toFixed(1) + '°' : '--';
    }
    if (stats.hum) {
      document.getElementById("humMin").innerText = stats.hum.min != null ? stats.hum.min.toFixed(1) + '%' : '--';
      document.getElementById("humMax").innerText = stats.hum.max != null ? stats.hum.max.toFixed(1) + '%' : '--';
      document.getElementById("humAvg").innerText = stats.hum.avg != null ? stats.hum.avg.toFixed(1) + '%' : '--';
    }
  } catch (e) {
    console.error("loadStats error:", e);
  }
}

// ===== بارگذاری تنظیمات =====
async function loadSettings() {
  try {
    const r = await fetch(API + "/settings");
    const rows = await r.json();
    const settings = {};
    rows.forEach(row => { settings[row.key] = row.value; });

    document.getElementById("temp_min").value = settings.temp_min || 10;
    document.getElementById("temp_max").value = settings.temp_max || 35;
    document.getElementById("hum_min").value = settings.hum_min || 20;
    document.getElementById("hum_max").value = settings.hum_max || 80;
    document.getElementById("upload_interval").value = settings.upload_interval || 300000;
    document.getElementById("realtime_interval").value = settings.realtime_interval || 3;
    
    // تبدیل مقادیر متنی دیتابیس به تیک چک‌باکس
    document.getElementById("telegram_enable").checked = (settings.telegram_enable == 1);
    document.getElementById("buzzer_enabled").checked = (settings.buzzer_enabled === undefined || settings.buzzer_enabled == 1);
    document.getElementById("display_enabled").checked = (settings.display_enabled === undefined || settings.display_enabled == 1);

    const newInterval = parseInt(document.getElementById("realtime_interval").value) || 3;
    restartRealtimeTimer(newInterval * 1000);
  } catch (e) {
    console.error("loadSettings error:", e);
  }
}

// ===== ذخیره تنظیمات =====
async function saveSettings() {
  // تبدیل تیک چک‌باکس به ۱ و ۰ برای ارسال به سرور
  const data = {
    temp_min: document.getElementById("temp_min").value,
    temp_max: document.getElementById("temp_max").value,
    hum_min: document.getElementById("hum_min").value,
    hum_max: document.getElementById("hum_max").value,
    upload_interval: document.getElementById("upload_interval").value,
    realtime_interval: document.getElementById("realtime_interval").value,
    telegram_enable: document.getElementById("telegram_enable").checked ? 1 : 0,
    buzzer_enabled: document.getElementById("buzzer_enabled").checked ? 1 : 0,
    display_enabled: document.getElementById("display_enabled").checked ? 1 : 0
  };

  // گرفتن کلید API به صورت موقت (باید در محیط امن قرار گیرد)
  const apiKey = prompt("لطفاً کلید API را وارد کنید:");
  if (!apiKey) return;

  try {
    await fetch(API + "/settings/update", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-API-Key": apiKey
      },
      body: JSON.stringify(data)
    });
    alert("تنظیمات با موفقیت ذخیره شد ✅");

    const newInterval = parseInt(data.realtime_interval) || 3;
    restartRealtimeTimer(newInterval * 1000);
  } catch (e) {
    alert("خطا در ذخیره تنظیمات");
  }
}

// ===== راه‌اندازی مجدد تایمر realtime =====
function restartRealtimeTimer(intervalMs) {
  if (realtimeTimer) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
  realtimeIntervalMs = intervalMs;
  realtimeTimer = setInterval(loadRealtime, intervalMs);
}

// ===== تست بوق =====
async function testBuzzer() {
  const apiKey = prompt("لطفاً کلید API را وارد کنید:");
  if (!apiKey) return;

  try {
    await fetch(API + "/buzzer/test", {
      headers: { "X-API-Key": apiKey }
    });
    alert("دستور تست بوق ارسال شد 🔔");
  } catch (e) {
    alert("خطا در ارسال دستور");
  }
}

// ===== پاک کردن دیتابیس =====
async function clearDatabase() {
  if (!confirm("⚠️ آیا مطمئن هستید که می‌خواهید تمام داده‌ها را پاک کنید؟ این عمل غیرقابل بازگشت است!")) return;
  const apiKey = prompt("برای تأیید، کلید API را وارد کنید:");
  if (!apiKey) return;

  try {
    const res = await fetch(API + "/clear", {
      method: "DELETE",
      headers: { "X-API-Key": apiKey }
    });
    const result = await res.json();
    if (result.success) {
      alert("همه داده‌ها با موفقیت پاک شدند 🗑️");
      loadHistory(currentRange);
      loadStats();
    } else {
      alert("خطا: " + (result.error || "نامشخص"));
    }
  } catch (e) {
    alert("خطا در ارتباط با سرور");
  }
}

// ===== بارگذاری تاریخچه (نمودار) =====
async function loadHistory(range, btnElement = null) {
  if(btnElement) {
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
  }

  currentRange = range;
  let url = API + "/history?range=" + range;

  const from = document.getElementById("fromDate")?.value;
  const to = document.getElementById("toDate")?.value;
  if (range === 'custom' && from && to) {
    url = API + "/history?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
  }

  try {
    const r = await fetch(url);
    const data = await r.json();

    const labels = data.map(x => new Date(x.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
    const temps = data.map(x => x.temperature);
    const hums = data.map(x => x.humidity);

    const tempData = temps.map(v => (v !== undefined && v !== null) ? v : null);
    const humData = hums.map(v => (v !== undefined && v !== null) ? v : null);

    // تنظیمات مشترک نمودار برای تم تاریک
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', maxTicksLimit: 10 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      }
    };

    if (tempChart) tempChart.destroy();
    if (humChart) humChart.destroy();

    const ctx1 = document.getElementById("tempChart").getContext("2d");
    tempChart = new Chart(ctx1, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "دما (°C)",
          data: tempData,
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14, 165, 233, 0.1)",
          borderWidth: 2,
          pointBackgroundColor: "#0ea5e9",
          pointRadius: 0,
          pointHitRadius: 10,
          tension: 0.4,
          fill: true
        }]
      },
      options: chartOptions
    });

    const ctx2 = document.getElementById("humChart").getContext("2d");
    humChart = new Chart(ctx2, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "رطوبت (%)",
          data: humData,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.1)",
          borderWidth: 2,
          pointBackgroundColor: "#8b5cf6",
          pointRadius: 0,
          pointHitRadius: 10,
          tension: 0.4,
          fill: true
        }]
      },
      options: chartOptions
    });
  } catch (e) {
    console.error("loadHistory error:", e);
  }
}

// ===== رویدادها =====
document.addEventListener("DOMContentLoaded", function() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24*60*60*1000);
  
  // تنظیم timezone محلی برای فرمت datetime-local
  const tzOffset = now.getTimezoneOffset() * 60000;
  document.getElementById("fromDate").value = new Date(oneDayAgo - tzOffset).toISOString().slice(0,16);
  document.getElementById("toDate").value = new Date(now - tzOffset).toISOString().slice(0,16);

  document.getElementById("applyCustomRange").addEventListener("click", function() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    if (from && to) loadHistory('custom');
    else alert("لطفاً هر دو تاریخ را انتخاب کنید.");
  });
});

// ===== اجرای اولیه =====
loadRealtime();
loadLatest();
loadSettings();
loadHistory('1h');
loadStats();

setInterval(loadLatest, 10000);
setInterval(loadStats, 60000);
