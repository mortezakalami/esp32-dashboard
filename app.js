const API = "https://esp32-api.kalamidev.workers.dev";

let tempChart, humChart;
let currentRange = '1h';

// ===== توابع کمکی =====
function formatUptime(seconds) {
  if (!seconds) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// محاسبه دمای احساسی و نقطه شبنم
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

// ===== بارگذاری آخرین داده =====
async function loadLatest() {
  try {
    const r = await fetch(API + "/latest");
    const data = await r.json();
    if (!data || !data.temperature) return;

    const temp = data.temperature;
    const hum = data.humidity;
    const uptime = data.uptime || 0;

    document.getElementById("temperature").innerText = temp.toFixed(1) + " °C";
    document.getElementById("humidity").innerText = hum.toFixed(1) + " %";
    document.getElementById("uptime").innerText = formatUptime(uptime);

    // محاسبات شاخص‌ها
    const hi = calcHeatIndex(temp, hum);
    const dp = calcDewPoint(temp, hum);
    document.getElementById("heatIndex").innerText = hi != null ? hi.toFixed(1) : '--';
    document.getElementById("dewPoint").innerText = dp != null ? dp.toFixed(1) : '--';
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
      document.getElementById("tempMin").innerText = stats.temp.min != null ? stats.temp.min.toFixed(1) + '°C' : '--';
      document.getElementById("tempMax").innerText = stats.temp.max != null ? stats.temp.max.toFixed(1) + '°C' : '--';
      document.getElementById("tempAvg").innerText = stats.temp.avg != null ? stats.temp.avg.toFixed(1) + '°C' : '--';
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
    document.getElementById("telegram_enable").value = settings.telegram_enable || 0;
  } catch (e) {
    console.error("loadSettings error:", e);
  }
}

// ===== ذخیره تنظیمات =====
async function saveSettings() {
  const data = {
    temp_min: document.getElementById("temp_min").value,
    temp_max: document.getElementById("temp_max").value,
    hum_min: document.getElementById("hum_min").value,
    hum_max: document.getElementById("hum_max").value,
    upload_interval: document.getElementById("upload_interval").value,
    telegram_enable: document.getElementById("telegram_enable").value
  };

  try {
    await fetch(API + "/settings/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    alert("تنظیمات ذخیره شد ✅");
  } catch (e) {
    alert("خطا در ذخیره تنظیمات");
  }
}

// ===== تست بوق =====
async function testBuzzer() {
  try {
    await fetch(API + "/buzzer/test");
    alert("دستور تست بوق ارسال شد 🔔");
  } catch (e) {
    alert("خطا در ارسال دستور");
  }
}

// ===== پاک کردن دیتابیس =====
async function clearDatabase() {
  if (!confirm("⚠️ آیا مطمئن هستید که می‌خواهید تمام داده‌ها را پاک کنید؟ این عمل غیرقابل بازگشت است!")) return;

  // برای امنیت، کلید API را از کاربر بگیریم (یا در هدر ثابت)
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

// ===== بارگذاری تاریخچه با بازه =====
async function loadHistory(range) {
  currentRange = range;
  let url = API + "/history?range=" + range;

  // اگر بازه سفارشی باشد
  const from = document.getElementById("fromDate")?.value;
  const to = document.getElementById("toDate")?.value;
  if (range === 'custom' && from && to) {
    url = API + "/history?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
  }

  try {
    const r = await fetch(url);
    const data = await r.json();

    const labels = data.map(x => new Date(x.created_at).toLocaleString());
    const temps = data.map(x => x.temperature);
    const hums = data.map(x => x.humidity);

    // برای شکستن نمودار در نقاط گم‌شده، مقادیر null را جایگزین NaN می‌کنیم
    const tempData = temps.map(v => (v !== undefined && v !== null) ? v : null);
    const humData = hums.map(v => (v !== undefined && v !== null) ? v : null);

    if (tempChart) tempChart.destroy();
    if (humChart) humChart.destroy();

    // نمودار دما
    const ctx1 = document.getElementById("tempChart").getContext("2d");
    tempChart = new Chart(ctx1, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "دما (°C)",
          data: tempData,
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.1)",
          borderWidth: 2,
          pointBackgroundColor: "#f97316",
          pointRadius: 2,
          spanGaps: false, // نقطه‌های گم‌شده را وصل نمی‌کند
          tension: 0.2,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: "#cbd5e1" } }
        },
        scales: {
          x: { ticks: { color: "#94a3b8", maxTicksLimit: 15 } },
          y: { ticks: { color: "#94a3b8" } }
        }
      }
    });

    // نمودار رطوبت
    const ctx2 = document.getElementById("humChart").getContext("2d");
    humChart = new Chart(ctx2, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "رطوبت (%)",
          data: humData,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          borderWidth: 2,
          pointBackgroundColor: "#3b82f6",
          pointRadius: 2,
          spanGaps: false,
          tension: 0.2,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: "#cbd5e1" } }
        },
        scales: {
          x: { ticks: { color: "#94a3b8", maxTicksLimit: 15 } },
          y: { ticks: { color: "#94a3b8" } }
        }
      }
    });
  } catch (e) {
    console.error("loadHistory error:", e);
  }
}

// ===== رویدادهای سفارشی =====
document.addEventListener("DOMContentLoaded", function() {
  // تنظیم تاریخ‌های پیش‌فرض برای بازه سفارشی
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24*60*60*1000);
  document.getElementById("fromDate").value = oneDayAgo.toISOString().slice(0,16);
  document.getElementById("toDate").value = now.toISOString().slice(0,16);

  // دکمه اعمال بازه سفارشی
  document.getElementById("applyCustomRange").addEventListener("click", function() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    if (from && to) {
      loadHistory('custom');
    } else {
      alert("لطفاً هر دو تاریخ را انتخاب کنید.");
    }
  });

  // دکمه بازنشانی بازه
  document.getElementById("resetRange").addEventListener("click", function() {
    loadHistory('1h');
    // reset input fields
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24*60*60*1000);
    document.getElementById("fromDate").value = oneDayAgo.toISOString().slice(0,16);
    document.getElementById("toDate").value = now.toISOString().slice(0,16);
  });
});

// ===== بارگذاری اولیه و تایمر =====
loadLatest();
loadSettings();
loadHistory('1h');
loadStats();

setInterval(loadLatest, 10000);
setInterval(loadStats, 60000); // هر دقیقه آمار به‌روز شود
