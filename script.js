const MQTT_CONFIG = {
  host:            '13ed109aa60347fb81c928d7e6d47baa.s1.eu.hivemq.cloud',
  port:            8884,
  protocol:        'wss',
  path:            '/mqtt',
  clientId:        'iot_dash_' + Math.random().toString(16).slice(2, 8),
  clean:           true,
  reconnectPeriod: 5000,
  username:        'MUH_RIZKYA_NAYOTTAMA_28',
  password:        'NAYOukk28',
};

const TOPIC_SUHU       = 'iot/suhu';
const TOPIC_KELEMBABAN = 'iot/kelembaban';
const TOPIC_CAHAYA     = 'iot/ldr';
const TOPIC_RELAY      = [
  'iot/relay1',
  'iot/relay2',
  'iot/relay3',
  'iot/relay4',
];
const TOPIC_RELAY_CMD  = [
  'iot/relay1/set',
  'iot/relay2/set',
  'iot/relay3/set',
  'iot/relay4/set',
];

const MAX_HISTORY      = 20;
const SUHU_ALERT_LIMIT = 30;

let mqttClient = null;
let lastSuhu   = null;
let lastHumid  = null;
const relayState = [false, false, false, false];
const history = [];
const MAX_HISTORY_TABLE = 20;

const elClock      = document.getElementById('realtime-clock');
const elMqttText   = document.getElementById('mqtt-status-text');
const elSuhuVal    = document.getElementById('suhu-value');
const elHumidVal   = document.getElementById('kelembapan-value');
const elSuhuStatus = document.getElementById('suhu-status');
const elSuhuCard   = document.getElementById('suhu-card');
const elSuhuAlert  = document.getElementById('suhu-alert');
const elLdrVal     = document.getElementById('ldr-value');
const elLdrStatus  = document.getElementById('ldr-status');
const elLdrCard    = document.getElementById('ldr-card');

const chartSuhu = new Chart(
  document.getElementById('chartSuhu').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Suhu (°C)',
        data: [],
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.15)',
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#16a34a',
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#dbeafe',
          borderWidth: 1,
          titleColor: '#0f172a',
          bodyColor: '#334155',
          callbacks: {
            label: c => ` ${c.parsed.y} °C`,
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxTicksLimit: 8 },
          grid: { color: '#e2e8f0' }
        },
        y: {
          ticks: {
            color: '#64748b',
            callback: v => v + '°'
          },
          grid: { color: '#e2e8f0' },
          suggestedMin: 20,
          suggestedMax: 40
        }
      }
    }
  }
);

const chartKelembapan = new Chart(
  document.getElementById('chartKelembapan').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Kelembapan (%)',
        data: [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.15)',
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#3b82f6',
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          borderColor: '#dbeafe',
          borderWidth: 1,
          titleColor: '#0f172a',
          bodyColor: '#334155',
          callbacks: {
            label: c => ` ${c.parsed.y} %`,
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxTicksLimit: 8 },
          grid: { color: '#e2e8f0' }
        },
        y: {
          ticks: {
            color: '#64748b',
            callback: v => v + '%'
          },
          grid: { color: '#e2e8f0' },
          suggestedMin: 30,
          suggestedMax: 80
        }
      }
    }
  }
);

function getTimeStr() {
  return new Date().toLocaleTimeString('id-ID', { hour12: false });
}

function updateClock() {
  elClock.textContent = getTimeStr();
}
setInterval(updateClock, 1000);
updateClock();

function setMqttStatus(connected) {
  elMqttText.textContent = connected ? 'Connected' : 'Disconnected';
  elMqttText.className = connected ? 'status-value connected' : 'status-value disconnected';
}

function updateSuhuStatus(value) {
  if (value >= SUHU_ALERT_LIMIT) {
    elSuhuStatus.textContent = 'Panas tinggi';
    elSuhuCard.classList.add('sensor-card--warning');
    elSuhuAlert.classList.remove('hidden');
  } else {
    elSuhuStatus.textContent = 'Suhu normal';
    elSuhuCard.classList.remove('sensor-card--warning');
    elSuhuAlert.classList.add('hidden');
  }
}

function updateLdrStatus(status) {
  const isBright = status === 'Terang';
  elLdrVal.textContent = status;
  elLdrStatus.textContent = status;
  elLdrCard.classList.toggle('sensor-card--bright', isBright);
  elLdrCard.classList.toggle('sensor-card--dark', !isBright);
}

function pushChart(chart, label, value) {
  if (chart.data.labels.length >= MAX_HISTORY) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  chart.update('active');
}

function addToHistory(time, suhu, humid) {
  history.push({ time, suhu, humid });
  if (history.length > MAX_HISTORY_TABLE) {
    history.shift();
  }
  updateHistoryTable();
}

function updateHistoryTable() {
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';
  history.slice(-10).forEach(entry => {  // Show last 10
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${entry.time}</td>
      <td>${entry.suhu !== null ? entry.suhu.toFixed(1) : '--'}</td>
      <td>${entry.humid !== null ? entry.humid.toFixed(1) : '--'}</td>
    `;
    tbody.appendChild(row);
  });
}

function processSuhu(val) {
  const value = parseFloat(val);
  if (isNaN(value)) return;

  lastSuhu = value;
  elSuhuVal.textContent = value.toFixed(1);
  updateSuhuStatus(value);
  pushChart(chartSuhu, getTimeStr(), value);
}

function processKelembapan(val) {
  const value = parseFloat(val);
  if (isNaN(value)) return;

  lastHumid = value;
  elHumidVal.textContent = value.toFixed(1);
  pushChart(chartKelembapan, getTimeStr(), value);

  // Add to history if suhu is available
  if (lastSuhu !== null) {
    addToHistory(getTimeStr(), lastSuhu, value);
  }
}

function processLdr(val) {
  const raw = String(val).trim();
  if (!raw.length) return;

  const normalized = raw.toUpperCase();
  let status = '';

  if (normalized === 'GELAP' || normalized === 'LOW' || normalized === '0') {
    status = 'Gelap';
  } else if (normalized === 'TERANG' || normalized === 'HIGH' || normalized === '1023') {
    status = 'Terang';
  } else {
    const numeric = parseInt(normalized, 10);
    if (!isNaN(numeric)) {
      status = numeric >= 500 ? 'Terang' : 'Gelap';
    }
  }

  if (!status) return;
  console.log('LDR status received:', raw, '=>', status);
  updateLdrStatus(status);
}

window.setRelay = function(index, state) {
  const idx = index - 1;
  const isOn = state === 'ON';
  relayState[idx] = isOn;

  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(TOPIC_RELAY_CMD[idx], state, { qos: 0, retain: true });
  }
  applyRelayUI(index, isOn);
};

window.setAllRelay = function(state) {
  for (let i = 1; i <= 4; i++) {
    window.setRelay(i, state);
  }
};

function applyRelayUI(index, isOn) {
  const card = document.getElementById(`rc-${index}`);
  const status = document.getElementById(`rs-${index}`);

  if (isOn) {
    card.classList.add('relay-active');
    status.textContent = 'ON';
  } else {
    card.classList.remove('relay-active');
    status.textContent = 'OFF';
  }
}

function processRelayMsg(topic, payload) {
  const index = TOPIC_RELAY.indexOf(topic);
  if (index === -1) return;

  const isOn = payload.trim().toUpperCase() === 'ON';
  relayState[index] = isOn;
  applyRelayUI(index + 1, isOn);
}

function connectMQTT() {
  console.log('Attempting MQTT connection to:', MQTT_CONFIG);
  mqttClient = mqtt.connect({
    hostname: MQTT_CONFIG.host,
    port: MQTT_CONFIG.port,
    protocol: MQTT_CONFIG.protocol,
    path: MQTT_CONFIG.path,
    clientId: MQTT_CONFIG.clientId,
    clean: MQTT_CONFIG.clean,
    reconnectPeriod: MQTT_CONFIG.reconnectPeriod,
    username: MQTT_CONFIG.username,
    password: MQTT_CONFIG.password,
    protocolVersion: 4,
  });

  mqttClient.on('connect', () => {
    console.log('MQTT connected successfully');
    setMqttStatus(true);
    [TOPIC_SUHU, TOPIC_KELEMBABAN, TOPIC_CAHAYA].forEach(topic => mqttClient.subscribe(topic, { qos: 0 }));
    TOPIC_RELAY.forEach(topic => mqttClient.subscribe(topic, { qos: 0 }));
  });

  mqttClient.on('message', (topic, message) => {
    const payload = message.toString().trim();
    if (topic === TOPIC_SUHU) processSuhu(payload);
    else if (topic === TOPIC_KELEMBABAN) processKelembapan(payload);
    else if (topic === TOPIC_CAHAYA) processLdr(payload);
    else if (TOPIC_RELAY.includes(topic)) processRelayMsg(topic, payload);
  });

  mqttClient.on('close', () => {
    console.warn('MQTT closed');
    setMqttStatus(false);
  });

  mqttClient.on('offline', () => {
    console.warn('MQTT offline');
    setMqttStatus(false);
  });

  mqttClient.on('reconnect', () => {
    console.warn('MQTT reconnecting');
    setMqttStatus(false);
  });

  mqttClient.on('error', err => {
    console.error('MQTT error:', err);
    setMqttStatus(false);
  });
}

window.addEventListener('load', () => {
  connectMQTT();
});
