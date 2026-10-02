// 平面波(幅のある波面の束)の反射・屈折シミュレーション 共通エンジン
// 各ページは window.SIM_CONFIG を定義してから読み込む。
//   boundaryOffset : 境界を画面中央から下げる量(768px 基準)
//   theta0         : 初期入射角 [rad]
//   v0             : 初期速さ(画面高さ/384 の何倍か)
//   modes          : [{ label, type:'none'|'reflect'|'refract', n, shade, shift, color, trans }]

(() => {
  const cfg = window.SIM_CONFIG;
  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d');

  // 配色は wave-simulator/remake/interference.html(波の干渉)にそろえる
  const C = {
    bg: '#faf4ee',
    shade: 'rgba(74,64,56,0.08)',     // もう一方の媒質
    axis: '#8c8175',
    wave: '#0060d0',                  // 入射波
    rayIn: 'rgba(0,96,208,0.3)',      // 進行方向(入射)
    rayOut: 'rgba(224,0,0,0.3)',      // 進行方向(反射・屈折)
    ink: '#4a4038',
    wavelet: '#c2185b',               // 素元波
  };
  const FONT = "'Hiragino Kaku Gothic ProN','Meiryo',system-ui,sans-serif";
  const TICK = 0.05;                 // 更新間隔 50ms 相当
  const THETA_MAX = Math.PI / 3;

  let W = 0, H = 0, dpr = 1, kx = 1, ky = 1;
  let theta1 = cfg.theta0;
  let v = 0;                         // 1 更新あたりに進む距離 [px]
  let phase = 0;                     // 入射波の山が進んだ距離 [px]
  let running = true;
  let showRays = false;
  let mode = cfg.modes[0];

  // 素元波による作図
  let showHuygens = false;
  let hd = null;                     // 注目する波面の位置 [px]
  let hold = 0;
  let keepFronts = false;            // 境界に触れた瞬間・離れた瞬間の波面を残す
  let showTriangles = false;         // 法則を導く三角形
  let hdMax = -Infinity;             // これまでに進んだ最大位置(繰り返しても残す)
  const N_WAVELET = 7;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ky = H / 768; kx = ky;   // 干渉シミュと同じく縦横同じ倍率
    document.documentElement.style.setProperty('--fs', Math.max(11, 15 * ky) + 'px');
  }
  window.addEventListener('resize', resize);
  resize();
  v = H / 384 * cfg.v0;

  const lambda0 = () => H / 12;
  const halfLen = () => 200 * kx;    // 波面の長さの半分
  const center = () => ({ cx: W / 2, cy: H / 2 + cfg.boundaryOffset * ky });

  // 屈折角(全反射なら null)
  function refractAngle() {
    if (mode.type !== 'refract') return theta1;
    const s2 = Math.sin(theta1) / mode.n;
    return s2 <= 1 ? Math.asin(s2) : null;
  }

  // 境界の中心を通る軸に沿って進む波面の束を描く。
  // 波面の中心は 中心 + d*(dx,dy)、d ≡ offset (mod lambda)
  function drawBeam(dx, dy, lambda, offset, hl, color, clip) {
    const { cx, cy } = center();
    const R = Math.hypot(W, H) + hl;
    ctx.save();
    ctx.beginPath();
    if (clip === 'upper') ctx.rect(0, 0, W, cy);
    else if (clip === 'lower') ctx.rect(0, cy, W, H - cy);
    else ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 * kx;
    ctx.lineCap = 'butt';
    const px = dy, py = -dx;        // 波面に沿う向き
    const start = ((offset % lambda) + lambda) % lambda;
    const n = Math.ceil(R / lambda) + 1;
    ctx.beginPath();
    for (let m = -n; m <= n; m++) {
      const d = start + m * lambda;
      const ox = cx + dx * d, oy = cy + dy * d;
      ctx.moveTo(ox - px * hl, oy - py * hl);
      ctx.lineTo(ox + px * hl, oy + py * hl);
    }
    ctx.stroke();
    ctx.restore();
  }

  function line(x0, y0, x1, y1, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cx, cy } = center();
    const lam = lambda0(), hl = halfLen();
    const s1 = Math.sin(theta1), c1 = Math.cos(theta1);
    const th2 = refractAngle();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.shade;
    if (mode.shade === 'upper') ctx.fillRect(0, 0, W, cy);
    if (mode.shade === 'lower') ctx.fillRect(0, cy, W, H - cy);

    ctx.globalAlpha = showHuygens ? 0.3 : 1;
    if (mode.type === 'none') {
      drawBeam(s1, c1, lam, phase, hl, C.wave, 'all');
    } else {
      drawBeam(s1, c1, lam, phase, hl, C.wave, 'upper');
      if (mode.type === 'reflect') {
        // 透過波(薄い色)と反射波
        drawBeam(s1, c1, lam, phase, hl, mode.trans, 'lower');
        drawBeam(s1, -c1, lam, phase + mode.shift * lam, hl, mode.color, 'upper');
      } else if (th2 !== null) {
        // 屈折波: 波長 1/n、境界上で入射波とつながる。束の幅は境界上で一致させる
        const c2 = Math.cos(th2);
        drawBeam(Math.sin(th2), c2, lam / mode.n, phase / mode.n, hl * c2 / c1, mode.color, 'lower');
      }
    }
    ctx.globalAlpha = 1;

    // 境界線と法線
    line(0, cy, W, cy, C.axis, 1);
    line(cx, 0, cx, H, C.axis, 1);

    if (showHuygens) drawHuygens(s1, c1, th2);

    // 進行方向
    if (showRays) {
      const LW = 8;
      line(cx, cy, cx - cy * Math.tan(theta1), 0, C.rayIn, LW);
      if (mode.type === 'none') line(cx, cy, cx + (H - cy) * Math.tan(theta1), H, C.rayOut, LW);
      else if (mode.type === 'reflect') line(cx, cy, cx + cy * Math.tan(theta1), 0, C.rayOut, LW);
      else if (th2 !== null) line(cx, cy, cx + (H - cy) * Math.tan(th2), H, C.rayOut, LW);
      ctx.globalAlpha = 1;
    }
  }

  // ---- ホイヘンスの原理による作図 ----
  // 束の中の波面を1枚だけ取り出し、境界に達した点から素元波を広げる。
  // 素元波に共通に接する線が、反射波・屈折波の束の中の波面と重なる。
  function huygensSpan() {
    const s1 = Math.sin(theta1), c1 = Math.cos(theta1);
    const xB = halfLen() / c1, xA = -xB;   // 束が境界に当たる範囲
    return { xA, xB, start: xA * s1 - H * 0.08, end: xB * s1 + H * 0.22 };
  }

  function waveletSide() {
    if (mode.type === 'reflect') return { clip: 'upper', ratio: 1 };
    if (mode.type === 'refract') return { clip: 'lower', ratio: 1 / mode.n };
    return { clip: 'lower', ratio: 1 };
  }

  // 注目する波面を、束の中のいずれかの山にそろえて置く
  function resetHuygens() {
    const { start } = huygensSpan();
    const lam = lambda0();
    hd = phase + Math.floor((start - phase) / lam) * lam;
    hold = 0;
  }

  function drawHuygens(s1, c1, th2) {
    const { cx, cy } = center();
    const { xA, xB } = huygensSpan();
    if (hd === null) resetHuygens();
    const d = hd;
    const side = waveletSide();
    const YEL = C.wavelet, ORG = C.ink;

    let kx2 = null, ky2 = null;
    if (mode.type === 'reflect') { kx2 = s1; ky2 = -c1; }
    else if (mode.type === 'none') { kx2 = s1; ky2 = c1; }
    else if (th2 !== null) { kx2 = Math.sin(th2); ky2 = Math.cos(th2); }

    const pts = [];
    for (let i = 0; i < N_WAVELET; i++) pts.push(xA + (xB - xA) * i / (N_WAVELET - 1));

    // 素元波
    ctx.save();
    ctx.beginPath();
    if (side.clip === 'upper') ctx.rect(0, 0, W, cy); else ctx.rect(0, cy, W, H - cy);
    ctx.clip();
    ctx.strokeStyle = YEL; ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    for (const x of pts) {
      const r = (d - x * s1) * side.ratio;
      if (r <= 0) continue;
      ctx.beginPath(); ctx.arc(cx + x, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    if (keepFronts) drawKeptFronts(xA, xB, s1, c1, side.ratio, kx2, ky2);

    // 境界に達していない部分(入射波面)と包絡線(新しい波面)
    const incident = [], fresh = [];
    const M = 60;
    for (let i = 0; i <= M; i++) {
      const x = xA + (xB - xA) * i / M;
      const t = d - x * s1;
      if (t <= 0) incident.push([cx + x + t * s1, cy + t * c1]);
      else if (kx2 !== null) fresh.push([cx + x + t * side.ratio * kx2, cy + t * side.ratio * ky2]);
    }
    if (s1 > 1e-6) {
      const xs = d / s1;
      if (xs > xA && xs < xB) {
        incident.push([cx + xs, cy]);
        if (kx2 !== null) fresh.unshift([cx + xs, cy]);
      }
    }
    const poly = (arr, color, w) => {
      if (arr.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(arr[0][0], arr[0][1]);
      for (const q of arr.slice(1)) ctx.lineTo(q[0], q[1]);
      ctx.stroke();
    };
    poly(incident, C.ink, Math.max(4, 7 * kx));
    poly(fresh, ORG, Math.max(4, 7 * kx));

    ctx.fillStyle = YEL;
    for (const x of pts) {
      if (d - x * s1 < 0) continue;
      ctx.beginPath(); ctx.arc(cx + x, cy, 5, 0, Math.PI * 2); ctx.fill();
    }

  }

  // 入射波面の一端 A が境界に触れた瞬間の波面 AB と、
  // 反射波(屈折波)の波面の一端 B' が境界から離れる瞬間の波面 A'B' を残す
  function drawKeptFronts(xA, xB, s1, c1, ratio, kx2, ky2) {
    const { cx, cy } = center();
    const w = Math.max(4, 6 * kx);
    const d0 = xA * s1, d1 = xB * s1;
    const newColor = mode.color || '#e00000';
    const tB = d0 - xB * s1, tA = (d1 - xA * s1) * ratio;
    const A = [cx + xA, cy], B = [cx + xB + tB * s1, cy + tB * c1];
    const B2 = [cx + xB, cy];
    const A2 = kx2 !== null ? [cx + xA + tA * kx2, cy + tA * ky2] : null;
    const got0 = hdMax >= d0, got1 = hdMax >= d1 && A2 !== null;

    if (showTriangles && got0 && got1 && s1 > 0.01) drawTriangles(A, B, A2, B2, newColor);
    if (got0) seg(A, B, C.wave, w, 'A', 'B');
    if (got1) seg(A2, B2, newColor, w, "A'", "B'");
  }

  // 反射・屈折の法則を導く2つの直角三角形
  //   △ABB' : 角B が直角、BB' = (入射波の速さ)×t、角A = 入射角
  //   △AA'B': 角A' が直角、AA' = (反射波・屈折波の速さ)×t、角B' = 反射角・屈折角
  //   斜辺 AB' が共通なので  BB' / AA' = sin(入射角) / sin(反射角・屈折角)
  function drawTriangles(A, B, A2, B2, newColor) {
    const lw = Math.max(2, 3 * ky);
    const reflect = mode.type === 'reflect';
    const names = reflect ? ['vt', 'vt', 'θ', "θ'"] : ['v₁t', 'v₂t', 'θ₁', 'θ₂'];

    // 面
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = C.wave; poly3(A, B, B2); ctx.fill();
    ctx.fillStyle = newColor; poly3(A, A2, B2); ctx.fill();
    ctx.globalAlpha = 1;

    // 速さ×時間 の辺と、共通の斜辺
    ctx.setLineDash([]);
    lineP(B, B2, C.wave, lw);
    lineP(A, A2, newColor, lw);
    lineP(A, B2, C.ink, lw);

    rightMark(B, A, B2, C.wave);
    rightMark(A2, A, B2, newColor);
    angleMark(A, B2, B, C.wave, names[2]);
    angleMark(B2, A, A2, newColor, names[3]);

    sideLabel(B, B2, [A, B, B2], C.wave, names[0]);
    sideLabel(A, A2, [A, A2, B2], newColor, names[1]);
  }

  function poly3(P, Q, R) {
    ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); ctx.lineTo(R[0], R[1]); ctx.closePath();
  }
  function lineP(P, Q, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); ctx.stroke();
  }
  function unit(P, Q) {
    const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1;
    return [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L, L];
  }
  // 頂点 P の直角マーク(P→Q と P→R の間)
  function rightMark(P, Q, R, color) {
    const [ux, uy] = unit(P, Q), [wx, wy] = unit(P, R);
    const a = 14 * ky;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, 2 * ky);
    ctx.beginPath();
    ctx.moveTo(P[0] + ux * a, P[1] + uy * a);
    ctx.lineTo(P[0] + (ux + wx) * a, P[1] + (uy + wy) * a);
    ctx.lineTo(P[0] + wx * a, P[1] + wy * a);
    ctx.stroke();
  }
  // 頂点 P の角(P→Q から P→R まで)の弧と名前
  function angleMark(P, Q, R, color, name) {
    const [ux, uy, L1] = unit(P, Q), [wx, wy, L2] = unit(P, R);
    const r = Math.min(46 * ky, 0.35 * Math.min(L1, L2));
    const a0 = Math.atan2(uy, ux);
    let da = Math.atan2(wy, wx) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da <= -Math.PI) da += 2 * Math.PI;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, 2.5 * ky);
    ctx.beginPath(); ctx.arc(P[0], P[1], r, a0, a0 + da, da < 0); ctx.stroke();
    const am = a0 + da / 2, rl = r + 16 * ky;
    label(name, P[0] + Math.cos(am) * rl, P[1] + Math.sin(am) * rl, color);
  }
  // 辺 PQ の外側(三角形の重心と反対側)に名前を書く
  function sideLabel(P, Q, tri, color, name) {
    const mx = (P[0] + Q[0]) / 2, my = (P[1] + Q[1]) / 2;
    const gx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, gy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const [ox, oy] = unit([gx, gy], [mx, my]);
    const off = 20 * ky;
    label(name, mx + ox * off, my + oy * off, color);
  }
  function label(text, x, y, color) {
    ctx.font = `600 ${Math.round(Math.max(13, 22 * ky))}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // 線分と、両端の外側に名前を描く
  function seg(P, Q, color, w, nameP, nameQ) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); ctx.stroke();
    const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1;
    const ux = (Q[0] - P[0]) / L, uy = (Q[1] - P[1]) / L;
    const off = 22 * ky;
    ctx.font = `600 ${Math.round(Math.max(13, 22 * ky))}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(nameP, P[0] - ux * off, P[1] - uy * off);
    ctx.fillText(nameQ, Q[0] + ux * off, Q[1] + uy * off);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // 作図をはじめからやり直す(残した波面も消す)
  function clearHuygens() { hd = null; hdMax = -Infinity; }

  function stepHuygens(dist, dt) {
    if (!showHuygens) return;
    if (hd === null) resetHuygens();
    const { end } = huygensSpan();
    if (hd >= end) {
      hold += dt;
      if (hold > 1.2) resetHuygens();
      return;
    }
    hd += dist;
    hdMax = Math.max(hdMax, hd);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (running) {
      const dist = v * dt / TICK;
      phase += dist;
      stepHuygens(dist, dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---- ボタン ----
  function holdRepeat(el, fn) {
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      fn(); stop();
      timer = setInterval(fn, TICK * 1000);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, stop));
  }

  const modeBox = document.getElementById('modes');
  cfg.modes.forEach(m => {
    const b = document.createElement('button');
    b.textContent = m.label;
    b.addEventListener('click', () => { mode = m; clearHuygens(); markOn(); });
    m.button = b;
    modeBox.appendChild(b);
  });
  holdRepeat(document.getElementById('angDown'), () => { theta1 = Math.max(0, theta1 - 0.02); clearHuygens(); });
  holdRepeat(document.getElementById('angUp'), () => { theta1 = Math.min(THETA_MAX, theta1 + 0.02); clearHuygens(); });

  // 選択中のボタンを濃く表示する
  function markOn() {
    cfg.modes.forEach(m => m.button.classList.toggle('on', m === mode));
    document.getElementById('raysOn').classList.toggle('on', showRays);
    document.getElementById('raysOff').classList.toggle('on', !showRays);
    document.getElementById('huygens').classList.toggle('on', showHuygens);
    document.getElementById('keep').classList.toggle('on', keepFronts);
    document.getElementById('tri').classList.toggle('on', showTriangles);
  }

  document.getElementById('raysOn').onclick = () => { showRays = true; markOn(); };
  document.getElementById('raysOff').onclick = () => { showRays = false; markOn(); };
  holdRepeat(document.getElementById('faster'), () => { v = Math.min(6, v + 0.2); });
  holdRepeat(document.getElementById('slower'), () => { v = Math.max(0, v - 0.2); });
  document.getElementById('pause').onclick = () => { running = !running; };
  const hBtn = document.getElementById('huygens');
  hBtn.onclick = () => {
    showHuygens = !showHuygens; clearHuygens();
    markOn();
  };
  // 「波面を残す」は素元波の作図に追加するモード。押すと作図も始める
  document.getElementById('keep').onclick = () => {
    keepFronts = !keepFronts;
    if (keepFronts && !showHuygens) { showHuygens = true; clearHuygens(); }
    markOn();
  };
  // 「三角形」は残した2本の波面から法則を導く三角形を描く。押すと作図と波面を残す機能も入る
  document.getElementById('tri').onclick = () => {
    showTriangles = !showTriangles;
    if (showTriangles) {
      if (!showHuygens) { showHuygens = true; clearHuygens(); }
      keepFronts = true;
    }
    markOn();
  };
  markOn();
  document.getElementById('back').onclick = () => { location.href = 'index.html'; };

  // 確認用: 時間を sec 秒ぶん進めて描く
  window.simStep = sec => {
    for (let t = 0; t < sec; t += TICK) { const dist = v; phase += dist; stepHuygens(dist, TICK); }
    draw();
  };

  requestAnimationFrame(loop);
})();
