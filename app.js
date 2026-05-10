/* ======= İKA YER KONTROL İSTASYONU ======= */
(function () {
  'use strict';

  // ── State ──
  const state = {
    mode: 'manuel', // 'manuel' | 'otonom' | 'stopped'
    battery: 78, voltage: 24.1, current: 3.2,
    ping: 22, speed: 3.2, heading: 128,
    signalDbm: -52,
    roll: -1.2, pitch: 3.5, yaw: 127.8,
    lat: 39.9255, lon: 32.8661, sats: 12,
    logPaused: false, confirmEnabled: true,
    aiOverlayOn: true, hudOn: true, recording: false,
    targetDist: 245,
    gpsTrail: []
  };

  // ── DOM Refs ──
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initMap();
    initCameraCanvas();
    initControls();
    initLog();
    initGamepad();
    startTelemetryLoop();
    startLogLoop();
    addLog('SİSTEM', 'Yer Kontrol İstasyonu başlatıldı', 'success');
    addLog('BAĞLANTI', 'Araç bağlantısı kuruldu - RF 915MHz', 'success');
    addLog('GPS', '12 uydu ile 3D fix sağlandı');
    addLog('LiDAR', 'VLP-16 başlatıldı - 360° tarama aktif');
    addLog('KAMERA', 'Ana kamera akışı başlatıldı - 1280×720 @ 30FPS');
  });

  // ── Clock ──
  function initClock() {
    function tick() {
      const now = new Date();
      $('#header-date').textContent = now.toLocaleDateString('tr-TR');
      $('#header-time').textContent = now.toLocaleTimeString('tr-TR');
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Map ──
  let map, marker, trailLine;
  function initMap() {
    map = L.map('minimap', {
      center: [state.lat, state.lon], zoom: 17,
      zoomControl: false, attributionControl: false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    marker = L.circleMarker([state.lat, state.lon], {
      radius: 6, fillColor: '#b8a44c', fillOpacity: 1,
      color: '#d4c058', weight: 2
    }).addTo(map);

    // Direction indicator
    const dirIcon = L.divIcon({
      html: '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid #b8a44c;transform:rotate(0deg);transform-origin:center bottom;" id="dir-arrow"></div>',
      iconSize: [12, 12], iconAnchor: [6, 12], className: ''
    });
    L.marker([state.lat, state.lon], { icon: dirIcon }).addTo(map);

    state.gpsTrail.push([state.lat, state.lon]);
    trailLine = L.polyline(state.gpsTrail, { color: '#b8a44c', weight: 2, opacity: 0.6 }).addTo(map);
  }

  function updateMap() {
    const newLat = state.lat + (Math.random() - 0.48) * 0.00005;
    const newLon = state.lon + (Math.random() - 0.45) * 0.00005;
    state.lat = newLat; state.lon = newLon;
    marker.setLatLng([newLat, newLon]);
    map.panTo([newLat, newLon]);
    state.gpsTrail.push([newLat, newLon]);
    if (state.gpsTrail.length > 200) state.gpsTrail.shift();
    trailLine.setLatLngs(state.gpsTrail);
  }

  // ── Camera Canvas ──
  let camCtx, camW, camH;
  function initCameraCanvas() {
    const canvas = $('#camera-canvas');
    const vp = $('#camera-viewport');
    function resize() {
      camW = canvas.width = vp.clientWidth;
      camH = canvas.height = vp.clientHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    camCtx = canvas.getContext('2d');
    requestAnimationFrame(renderCamera);
  }

  let camFrame = 0;
  function renderCamera() {
    camFrame++;
    const ctx = camCtx;
    if (!ctx || !camW) { requestAnimationFrame(renderCamera); return; }

    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, camH * 0.45);
    skyGrad.addColorStop(0, '#1a2a35');
    skyGrad.addColorStop(1, '#2a3a30');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, camW, camH * 0.45);

    // Ground
    const gndGrad = ctx.createLinearGradient(0, camH * 0.45, 0, camH);
    gndGrad.addColorStop(0, '#2a3525');
    gndGrad.addColorStop(1, '#1a2518');
    ctx.fillStyle = gndGrad;
    ctx.fillRect(0, camH * 0.45, camW, camH * 0.55);

    // Horizon line
    ctx.strokeStyle = 'rgba(200,208,184,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, camH * 0.45);
    ctx.lineTo(camW, camH * 0.45);
    ctx.stroke();

    // Road - perspective
    const vanishX = camW / 2;
    const vanishY = camH * 0.45;
    const roadW = camW * 0.6;

    ctx.fillStyle = '#2a2f28';
    ctx.beginPath();
    ctx.moveTo(vanishX - 5, vanishY);
    ctx.lineTo(vanishX + 5, vanishY);
    ctx.lineTo(camW / 2 + roadW / 2, camH);
    ctx.lineTo(camW / 2 - roadW / 2, camH);
    ctx.closePath();
    ctx.fill();

    // Road edges
    ctx.strokeStyle = 'rgba(200,200,180,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vanishX - 4, vanishY);
    ctx.lineTo(camW / 2 - roadW / 2, camH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vanishX + 4, vanishY);
    ctx.lineTo(camW / 2 + roadW / 2, camH);
    ctx.stroke();

    // Center dashed line
    ctx.setLineDash([20, 30]);
    ctx.strokeStyle = 'rgba(200,180,80,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vanishX, vanishY);
    ctx.lineTo(vanishX, camH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Simulated objects (cones, signs)
    drawCone(ctx, vanishX - roadW * 0.18, camH * 0.68, 10);
    drawCone(ctx, vanishX + roadW * 0.22, camH * 0.62, 8);
    drawCone(ctx, vanishX - roadW * 0.08, camH * 0.55, 5);

    // Scan line effect
    const scanY = (camFrame * 2) % camH;
    ctx.strokeStyle = 'rgba(200,208,184,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(camW, scanY);
    ctx.stroke();

    // Static noise (subtle)
    if (camFrame % 3 === 0) {
      for (let i = 0; i < 30; i++) {
        const nx = Math.random() * camW;
        const ny = Math.random() * camH;
        ctx.fillStyle = `rgba(200,208,184,${Math.random() * 0.03})`;
        ctx.fillRect(nx, ny, 1, 1);
      }
    }

    // Update AI bounding boxes
    if (state.aiOverlayOn && camFrame % 60 === 0) updateAIBoxes();

    requestAnimationFrame(renderCamera);
  }

  function drawCone(ctx, x, y, size) {
    ctx.fillStyle = '#c86020';
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size * 0.5, y);
    ctx.lineTo(x + size * 0.5, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0f0e0';
    ctx.fillRect(x - size * 0.3, y - size * 0.6, size * 0.6, size * 0.15);
  }

  // ── AI Overlay ──
  const aiObjects = [
    { label: 'Koni', conf: 94, x: 32, y: 58, w: 6, h: 12 },
    { label: 'Koni', conf: 87, x: 58, y: 52, w: 5, h: 10 },
    { label: 'Tabela', conf: 78, x: 72, y: 32, w: 8, h: 12 }
  ];

  function updateAIBoxes() {
    const overlay = $('#ai-overlay');
    overlay.innerHTML = '';
    aiObjects.forEach(obj => {
      const ox = obj.x + (Math.random() - 0.5) * 2;
      const oy = obj.y + (Math.random() - 0.5) * 1;
      const box = document.createElement('div');
      box.className = 'ai-bbox';
      box.style.cssText = `left:${ox}%;top:${oy}%;width:${obj.w}%;height:${obj.h}%`;
      const lbl = document.createElement('div');
      lbl.className = 'ai-bbox-label';
      const c = obj.conf + Math.floor(Math.random() * 6 - 3);
      lbl.textContent = `${obj.label} ${c}%`;
      box.appendChild(lbl);
      overlay.appendChild(box);
    });
  }
  // Initial boxes
  setTimeout(updateAIBoxes, 500);

  // ── Controls ──
  function initControls() {
    // Mode buttons
    $('#btn-manuel').addEventListener('click', () => switchMode('manuel'));
    $('#btn-otonom').addEventListener('click', () => switchMode('otonom'));
    $('#btn-emergency').addEventListener('click', emergencyStop);
    $('#btn-emergency-top').addEventListener('click', emergencyStop);

    // Confirm toggle
    $('#confirm-toggle').addEventListener('change', (e) => {
      state.confirmEnabled = e.target.checked;
    });

    // Modal
    $('#modal-cancel').addEventListener('click', () => $('#confirm-modal').classList.add('hidden'));
    $('#modal-confirm').addEventListener('click', () => {
      $('#confirm-modal').classList.add('hidden');
      applyMode(pendingMode);
    });

    // Camera controls
    $('#btn-cam-overlay').addEventListener('click', function () {
      state.aiOverlayOn = !state.aiOverlayOn;
      this.classList.toggle('active');
      $('#ai-overlay').style.display = state.aiOverlayOn ? 'block' : 'none';
    });
    $('#btn-cam-hud').addEventListener('click', function () {
      state.hudOn = !state.hudOn;
      this.classList.toggle('active');
      $('#hud-overlay').style.opacity = state.hudOn ? 1 : 0;
    });
    $('#btn-cam-record').addEventListener('click', function () {
      state.recording = !state.recording;
      this.classList.toggle('active');
      $('#cam-rec-dot').classList.toggle('recording');
      addLog('KAMERA', state.recording ? 'Kayıt başlatıldı' : 'Kayıt durduruldu', state.recording ? 'success' : 'warning');
    });

    // Log controls
    $('#btn-log-clear').addEventListener('click', () => {
      $('#log-stream').innerHTML = '';
      addLog('SİSTEM', 'Log temizlendi');
    });
    $('#btn-log-pause').addEventListener('click', function () {
      state.logPaused = !state.logPaused;
      this.textContent = state.logPaused ? '▶' : '⏸';
    });
  }

  let pendingMode = null;
  function switchMode(mode) {
    if (mode === state.mode) return;
    if (state.confirmEnabled && mode === 'otonom') {
      pendingMode = mode;
      $('#modal-message').textContent = 'Otonom sürüş başlatılsın mı?';
      $('#confirm-modal').classList.remove('hidden');
    } else if (state.confirmEnabled && mode === 'manuel' && state.mode === 'otonom') {
      pendingMode = mode;
      $('#modal-message').textContent = 'Manuel kontrole geçilsin mi?';
      $('#confirm-modal').classList.remove('hidden');
    } else {
      applyMode(mode);
    }
  }

  function applyMode(mode) {
    state.mode = mode;
    // Update header indicator
    const ind = $('#mode-indicator');
    ind.className = 'mode-indicator mode-' + mode;
    $('#mode-text').textContent = mode.toUpperCase();
    // Update buttons
    $('#btn-manuel').classList.toggle('active', mode === 'manuel');
    $('#btn-otonom').classList.toggle('active', mode === 'otonom');
    // HUD
    $('#hud-mode').textContent = mode.toUpperCase();
    addLog('KONTROL', `Mod değiştirildi: ${mode.toUpperCase()}`, 'success');
  }

  function emergencyStop() {
    state.mode = 'stopped';
    state.speed = 0;
    const ind = $('#mode-indicator');
    ind.className = 'mode-indicator mode-stopped';
    $('#mode-text').textContent = 'DURDURULDU';
    $('#btn-manuel').classList.remove('active');
    $('#btn-otonom').classList.remove('active');
    $('#hud-mode').textContent = 'DURDURULDU';
    addLog('ACİL', '⛔ ACİL DURDURMA AKTİF - Tüm motorlar durduruldu', 'error');
    addLog('KONTROL', 'Aracı yeniden başlatmak için mod seçin', 'warning');
  }

  // ── Telemetry Loop ──
  function startTelemetryLoop() {
    setInterval(() => {
      if (state.mode === 'stopped') {
        state.speed = Math.max(0, state.speed - 0.5);
      } else {
        state.speed = Math.max(0, state.speed + (Math.random() - 0.5) * 0.4);
        state.speed = Math.min(state.speed, 15);
      }
      state.battery = Math.max(5, state.battery - Math.random() * 0.02);
      state.voltage = 20 + (state.battery / 100) * 5;
      state.current = state.speed > 0 ? 1.5 + state.speed * 0.4 + Math.random() * 0.3 : 0.3;
      state.ping = Math.max(5, Math.min(120, state.ping + (Math.random() - 0.5) * 8));
      state.heading = (state.heading + (Math.random() - 0.48) * 0.5 + 360) % 360;
      state.roll = state.roll + (Math.random() - 0.5) * 0.3;
      state.pitch = state.pitch + (Math.random() - 0.5) * 0.2;
      state.yaw = state.heading;
      state.signalDbm = Math.max(-80, Math.min(-30, state.signalDbm + (Math.random() - 0.5) * 3));
      state.targetDist = Math.max(10, state.targetDist - state.speed * 0.05);

      updateTelemetryUI();
      updateMap();
    }, 1000);
  }

  function updateTelemetryUI() {
    // Battery
    const bp = Math.round(state.battery);
    $('#battery-percent').textContent = bp + '%';
    $('#battery-voltage').textContent = state.voltage.toFixed(1) + 'V';
    $('#battery-current').textContent = state.current.toFixed(1) + 'A';
    $('#battery-eta').textContent = '~' + Math.round(state.battery * 0.55) + 'dk';
    const fill = $('#battery-fill');
    fill.style.height = bp + '%';
    fill.className = 'battery-fill' + (bp < 20 ? ' danger' : bp < 40 ? ' warning' : '');
    $('#battery-percent').style.color = bp < 20 ? 'var(--danger)' : bp < 40 ? 'var(--warning)' : 'var(--success)';

    // Ping
    const p = Math.round(state.ping);
    $('#ping-value').textContent = p;
    const pingColor = p < 40 ? 'var(--success)' : p < 80 ? 'var(--warning)' : 'var(--danger)';
    $('#ping-value').style.color = pingColor;
    $('#ping-bar').style.width = Math.min(100, p) + '%';
    $('#ping-bar').style.background = pingColor;

    // Speed
    $('#speed-value').textContent = state.speed.toFixed(1);
    drawSpeedGauge();

    // Signal
    const sigBars = $$('.signal-bar');
    const strength = Math.round(((state.signalDbm + 80) / 50) * 5);
    sigBars.forEach((b, i) => b.classList.toggle('active', i < strength));
    $('#signal-dbm').textContent = Math.round(state.signalDbm) + ' dBm';

    // IMU
    $('#imu-roll').textContent = state.roll.toFixed(1) + '°';
    $('#imu-pitch').textContent = state.pitch.toFixed(1) + '°';
    $('#imu-yaw').textContent = state.heading.toFixed(1) + '°';

    // GPS
    $('#gps-lat').textContent = state.lat.toFixed(4) + '°K';
    $('#gps-lon').textContent = state.lon.toFixed(4) + '°D';

    // HUD
    $('#hud-speed').textContent = state.speed.toFixed(1) + ' km/s';
    const dir = headingToDir(state.heading);
    $('#hud-heading').textContent = Math.round(state.heading) + '° ' + dir;
    $('#hud-target').textContent = Math.round(state.targetDist) + 'm';
    $('#hud-coords').textContent = state.lat.toFixed(4) + '°K  ' + state.lon.toFixed(4) + '°D';

    // Compass strip
    updateCompass();
  }

  function headingToDir(h) {
    const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
    return dirs[Math.round(h / 45) % 8];
  }

  function updateCompass() {
    const strip = $('#compass-strip');
    const h = Math.round(state.heading);
    const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
    let text = '';
    for (let a = h - 40; a <= h + 40; a += 10) {
      const na = ((a % 360) + 360) % 360;
      if (na % 45 === 0) {
        text += ` ${dirs[na / 45]} `;
      } else {
        text += ` ${na}° `;
      }
    }
    strip.textContent = text;
  }

  // ── Speed Gauge ──
  function drawSpeedGauge() {
    const canvas = $('#speed-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h - 5;
    const r = 65;
    const startA = Math.PI;
    const endA = 2 * Math.PI;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA);
    ctx.strokeStyle = 'rgba(42,58,40,0.5)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Value arc
    const pct = Math.min(state.speed / 15, 1);
    const valA = startA + pct * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, valA);
    const arcColor = pct < 0.6 ? '#4a8c3a' : pct < 0.85 ? '#c89030' : '#c83030';
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Tick marks
    for (let i = 0; i <= 15; i += 3) {
      const a = startA + (i / 15) * Math.PI;
      const x1 = cx + Math.cos(a) * (r - 10);
      const y1 = cy + Math.sin(a) * (r - 10);
      const x2 = cx + Math.cos(a) * (r + 2);
      const y2 = cy + Math.sin(a) * (r + 2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(200,208,184,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,208,184,0.4)';
      ctx.font = '9px Share Tech Mono';
      ctx.textAlign = 'center';
      ctx.fillText(i, cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18) + 3);
    }

    // Needle
    const needleA = startA + pct * Math.PI;
    const nx = cx + Math.cos(needleA) * (r - 25);
    const ny = cy + Math.sin(needleA) * (r - 25);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = arcColor;
    ctx.fill();
  }

  // ── Log System ──
  const logMessages = [
    ['LiDAR', 'Tarama tamamlandı - 1847 nokta algılandı'],
    ['NAV', 'Rota güncellendi - sonraki waypoint: WP3'],
    ['MOTOR', 'Sol motor: 1240 RPM | Sağ motor: 1255 RPM'],
    ['IMU', 'Kalibrasyon kararlı - drift: 0.02°/s'],
    ['KAMERA', 'Nesne algılandı: Koni (güven: 94%)'],
    ['GPS', 'Konum güncellendi - doğruluk: ±1.2m'],
    ['BAĞLANTI', 'Heartbeat alındı - gecikme: 18ms'],
    ['KONTROL', 'Direksiyon açısı: 3.2° sol'],
    ['PLANLAMA', 'Engel algılandı - rota yeniden hesaplanıyor'],
    ['LiDAR', 'Engel mesafesi: 4.7m - yavaşlatılıyor'],
    ['NAV', 'Kavşak yaklaşımı - 12m kala'],
    ['MOTOR', 'Sıcaklık normal - Sol: 42°C Sağ: 44°C'],
    ['SİSTEM', 'CPU: 34% | RAM: 1.2GB/4GB | GPU: 28%'],
    ['KAMERA', 'Yaya tespiti aktif - güvenli bölge temiz'],
    ['BAĞLANTI', 'Paket kaybı: 0.1% - bağlantı kararlı'],
  ];
  let logIdx = 0;

  function initLog() { }

  function startLogLoop() {
    setInterval(() => {
      if (state.logPaused || state.mode === 'stopped') return;
      const msg = logMessages[logIdx % logMessages.length];
      addLog(msg[0], msg[1]);
      logIdx++;
    }, 3000);
  }

  function addLog(source, message, type = '') {
    const stream = $('#log-stream');
    const entry = document.createElement('div');
    entry.className = 'log-entry' + (type ? ' ' + type : '');
    const now = new Date();
    const time = now.toLocaleTimeString('tr-TR', { hour12: false });
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-source">[${source}]</span><span class="log-msg">${message}</span>`;
    stream.appendChild(entry);
    // Keep max 100 entries
    while (stream.children.length > 100) stream.removeChild(stream.firstChild);
    stream.scrollTop = stream.scrollHeight;
  }

  // ── Gamepad ──
  function initGamepad() {
    window.addEventListener('gamepadconnected', (e) => {
      $('#gamepad-indicator').classList.add('active');
      $('#gp-status').textContent = e.gamepad.id.substring(0, 30);
      $('#gp-status').classList.add('connected');
      addLog('GAMEPAD', `Bağlandı: ${e.gamepad.id}`, 'success');
    });
    window.addEventListener('gamepaddisconnected', () => {
      $('#gamepad-indicator').classList.remove('active');
      $('#gp-status').textContent = 'Bağlı Değil';
      $('#gp-status').classList.remove('connected');
      addLog('GAMEPAD', 'Bağlantı kesildi', 'warning');
    });

    // Poll gamepad
    function pollGamepad() {
      const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
      if (gp) {
        const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
        const ldot = $('#gp-left-dot');
        ldot.style.transform = `translate(${lx * 12}px, ${ly * 12}px)`;

        const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
        const rdot = $('#gp-right-dot');
        rdot.style.transform = `translate(${rx * 12}px, ${ry * 12}px)`;
      }
      requestAnimationFrame(pollGamepad);
    }
    pollGamepad();
  }

})();
