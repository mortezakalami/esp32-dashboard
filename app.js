const API =
"https://esp32-api.kalamidev.workers.dev";

let tempChart;
let humChart;

async function loadLatest(){

const r =
await fetch(API+"/latest");

const data =
await r.json();

if(!data) return;

document.getElementById(
"temperature"
).innerText =
data.temperature.toFixed(1)+" °C";

document.getElementById(
"humidity"
).innerText =
data.humidity.toFixed(1)+" %";

}

async function loadSettings(){

const r =
await fetch(API+"/settings");

const rows =
await r.json();

const settings={};

rows.forEach(row=>{
settings[row.key]=row.value;
});

document.getElementById("temp_min").value =
settings.temp_min;

document.getElementById("temp_max").value =
settings.temp_max;

document.getElementById("hum_min").value =
settings.hum_min;

document.getElementById("hum_max").value =
settings.hum_max;

}

async function saveSettings(){

await fetch(
API+"/settings/update",
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({

temp_min:
document.getElementById("temp_min").value,

temp_max:
document.getElementById("temp_max").value,

hum_min:
document.getElementById("hum_min").value,

hum_max:
document.getElementById("hum_max").value

})
});

alert("Saved");
}

async function testBuzzer(){

await fetch(
API+"/buzzer/test"
);

alert("Command Sent");
}

async function loadHistory(range){

const r =
await fetch(
API+"/history?range="+range
);

const data =
await r.json();

const labels =
data.map(x=>
new Date(
x.created_at
).toLocaleString()
);

const temps =
data.map(x=>x.temperature);

const hums =
data.map(x=>x.humidity);

if(tempChart)
tempChart.destroy();

if(humChart)
humChart.destroy();

tempChart =
new Chart(
document.getElementById("tempChart"),
{
type:"line",
data:{
labels,
datasets:[
{
label:"Temperature",
data:temps
}
]
}
}
);

humChart =
new Chart(
document.getElementById("humChart"),
{
type:"line",
data:{
labels,
datasets:[
{
label:"Humidity",
data:hums
}
]
}
}
);

}

loadLatest();
loadSettings();
loadHistory("1h");

setInterval(
loadLatest,
10000
);