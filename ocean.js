/* Living ocean background: a procedural bioluminescent humpback, light rays, marine snow and bubbles. */
(function () {
  const cv = document.getElementById('ocean');
  const ctx = cv.getContext('2d');
  const fx = document.getElementById('fx');
  const fctx = fx.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, scrollDepth = 0;
  const snow = [], bubbles = [], burst = [];

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    for (const c of [cv, fx]) { c.width = W * dpr; c.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (still) frame(20);
  }
  for (let i = 0; i < 110; i++) snow.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + .3, s: Math.random() * .012 + .004, a: Math.random() * .5 + .12 });
  for (let i = 0; i < 16; i++) bubbles.push({ x: Math.random(), y: Math.random(), r: Math.random() * 4 + 1.5, s: Math.random() * .05 + .02, p: Math.random() * 6 });

  function bodyShape(u) {
    if (u < .1) return .04 + .8 * Math.pow(u / .1, .62);
    if (u < .34) return .84 + .16 * Math.sin((u - .1) / .24 * Math.PI / 2);
    return Math.max(.035, 1 - Math.pow((u - .34) / .66, 1.45) * .98);
  }

  function spine(x, y, L, t, dir) {
    const N = 72, pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const amp = L * .075 * Math.pow(u, 2.1);
      const wave = Math.sin(t * 1.25 - u * 3.1) * amp;
      const arch = -L * .025 * Math.sin(u * Math.PI);
      pts.push({ u, x: x - dir * u * L, y: y + wave + arch });
    }
    for (let i = 0; i <= N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1;
      pts[i].nx = -dy / m * -dir; pts[i].ny = dx / m * -dir;
      pts[i].w = L * .105 * bodyShape(pts[i].u);
    }
    return pts;
  }
  /* s<0 = back, s>0 = belly */
  const at = (p, s) => { const w = p.w * (s < 0 ? .78 : 1.12); return [p.x + p.nx * w * s, p.y + p.ny * w * s]; };

  function stroke(pts, s, from, to, style, width) {
    ctx.beginPath();
    let first = true;
    for (const p of pts) {
      if (p.u < from || p.u > to) continue;
      const [a, b] = at(p, s);
      first ? ctx.moveTo(a, b) : ctx.lineTo(a, b); first = false;
    }
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke();
  }

  function fluke(p, prev, L, t, dir) {
    const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
    const flap = Math.cos(t * 1.25 - 3.1);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    const s = L * .17;
    const lobe = (side, lift) => {
      ctx.beginPath(); ctx.moveTo(-s * .05, 0);
      ctx.bezierCurveTo(s * .12, side * s * .12, s * .46, side * s * lift, s * .98, side * s * (lift + .22));
      ctx.bezierCurveTo(s * .72, side * s * (lift * .5), s * .46, side * s * .1, s * .32, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(66,170,235,.26)'; ctx.fill();
      ctx.strokeStyle = 'rgba(180,240,255,.75)'; ctx.lineWidth = 1.2; ctx.stroke();
      for (let k = 1; k < 5; k++) {
        ctx.beginPath(); ctx.moveTo(s * .03, side * 2);
        ctx.quadraticCurveTo(s * .4, side * s * (.12 + lift * k * .13), s * (.56 + k * .08), side * s * (lift * .55 + .05 * k));
        ctx.strokeStyle = 'rgba(120,225,255,.32)'; ctx.lineWidth = .8; ctx.stroke();
      }
    };
    lobe(1, .32 + flap * .16); lobe(-1, .32 - flap * .16);
    ctx.restore();
  }

  function pectoral(p, L, t, dir) {
    const [bx, by] = at(p, .82);
    const sw = Math.sin(t * .9) * .16;
    const len = L * .3;
    ctx.save(); ctx.translate(bx, by); ctx.scale(dir === 1 ? -1 : 1, 1); ctx.rotate(.82 + sw);
    ctx.beginPath(); ctx.moveTo(-len * .04, -len * .05);
    ctx.bezierCurveTo(len * .3, -len * .13, len * .75, -len * .1, len, 0);
    ctx.bezierCurveTo(len * .72, len * .07, len * .3, len * .12, 0, len * .06);
    ctx.closePath();
    ctx.fillStyle = 'rgba(58,155,225,.3)'; ctx.fill();
    ctx.strokeStyle = 'rgba(180,240,255,.72)'; ctx.lineWidth = 1.2; ctx.stroke();
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath(); ctx.moveTo(len * .04, k * len * .012);
      ctx.quadraticCurveTo(len * .5, k * len * .03, len * .92, k * len * .007);
      ctx.strokeStyle = 'rgba(120,225,255,.32)'; ctx.lineWidth = .8; ctx.stroke();
    }
    ctx.restore();
  }

  function whale(x, y, L, t, dir, alpha) {
    const pts = spine(x, y, L, t, dir);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';

    const halo = ctx.createRadialGradient(x - dir * L * .4, y, 0, x - dir * L * .4, y, L * .68);
    halo.addColorStop(0, 'rgba(50,160,240,.17)'); halo.addColorStop(1, 'rgba(50,160,240,0)');
    ctx.fillStyle = halo; ctx.fillRect(x - dir * L * .4 - L, y - L, L * 2, L * 2);

    const last = pts[pts.length - 1];
    fluke(last, pts[pts.length - 4], L, t, dir);

    ctx.beginPath();
    pts.forEach((p, i) => { const [a, b] = at(p, -1); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    for (let i = pts.length - 1; i >= 0; i--) { const [a, b] = at(pts[i], 1); ctx.lineTo(a, b); }
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y - L * .1, x, y + L * .13);
    g.addColorStop(0, 'rgba(20,70,150,.42)'); g.addColorStop(.55, 'rgba(34,110,195,.26)'); g.addColorStop(1, 'rgba(120,220,255,.34)');
    ctx.fillStyle = g; ctx.fill();

    stroke(pts, -1, 0, 1, 'rgba(70,190,255,.22)', 5);
    stroke(pts, 1, 0, 1, 'rgba(70,190,255,.22)', 5);
    stroke(pts, -1, 0, 1, 'rgba(200,245,255,.85)', 1.3);
    stroke(pts, 1, 0, 1, 'rgba(200,245,255,.85)', 1.3);

    for (let s = -.85; s < .3; s += .17) {
      const flow = s === -.34 || Math.abs(s + .51) < .01;
      if (flow) { ctx.setLineDash([L * .04, L * .03]); ctx.lineDashOffset = t * 18 * dir; }
      stroke(pts, s, .04, .97, flow ? 'rgba(190,245,255,.55)' : 'rgba(110,215,255,.2)', flow ? 1.1 : .8);
      ctx.setLineDash([]);
    }
    for (let s = .32; s < 1; s += .085) stroke(pts, s, .015, .47 + (1 - s) * .1, 'rgba(205,245,255,.5)', .9);

    /* tubercles on the head and sparkle along the back */
    for (let i = 2; i < 36; i += 2) {
      const p = pts[i]; const [a, b] = at(p, -.55 - (i % 4) * .08);
      ctx.beginPath(); ctx.arc(a, b, L * .0028 + (i % 3) * .3, 0, 7);
      ctx.fillStyle = 'rgba(220,250,255,.7)'; ctx.fill();
    }
    const dor = pts[50]; const [dx, dy] = at(dor, -1);
    ctx.beginPath(); ctx.moveTo(dx + dir * L * .03, dy); ctx.quadraticCurveTo(dx - dir * L * .012, dy - L * .022, dx - dir * L * .035, dy + 2);
    ctx.strokeStyle = 'rgba(200,245,255,.8)'; ctx.lineWidth = 1.2; ctx.stroke();

    pectoral(pts[19], L, t, dir);

    const [ex, ey] = at(pts[7], .22);
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, L * .03);
    eg.addColorStop(0, 'rgba(255,255,255,.95)'); eg.addColorStop(.18, 'rgba(160,240,255,.7)'); eg.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, L * .03, 0, 7); ctx.fill();
    ctx.restore();
  }

  function rays(t, light) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const cx = W * (.12 + i * .16) + Math.sin(t * .13 + i) * 34;
      const w = 40 + i * 12, drop = H * (.9 + i * .03), lean = 100 + i * 34;
      const g = ctx.createLinearGradient(0, 0, 0, drop);
      g.addColorStop(0, `rgba(120,215,255,${.11 * light})`); g.addColorStop(1, 'rgba(120,215,255,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(cx, -10); ctx.lineTo(cx + w, -10); ctx.lineTo(cx + w + lean, drop); ctx.lineTo(cx + lean - w * 1.6, drop);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function frame(t) {
    const d = Math.min(1, scrollDepth);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    const shade = (a, b) => Math.round(a + (b - a) * d);
    bg.addColorStop(0, `rgb(${shade(10, 3)},${shade(62, 16)},${shade(128, 46)})`);
    bg.addColorStop(.5, `rgb(${shade(5, 3)},${shade(32, 12)},${shade(82, 34)})`);
    bg.addColorStop(1, 'rgb(3,10,29)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    rays(t, 1 - d * .75);

    const L = Math.min(W * (W < 760 ? 1.02 : .62), 760);
    const span = W + L * 1.9, speed = span / 72;
    const px = W + L * .35 - ((t * speed) % span);
    const py = H * (.52 + Math.sin(t * .19) * .11) - scrollDepth * 40;
    whale(px, py, L, t, -1, .95);
    const far = (t * speed * .42 + span * .55) % (W + 420);
    whale(far - 210, H * (.2 + Math.sin(t * .12) * .05), 210, t * .8, 1, .3);

    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of snow) {
      const y = (s.y + t * s.s) % 1, x = s.x + Math.sin(t * .2 + s.y * 9) * .006;
      ctx.beginPath(); ctx.arc(x * W, y * H, s.r, 0, 7); ctx.fillStyle = `rgba(190,235,255,${s.a})`; ctx.fill();
    }
    for (const b of bubbles) {
      const y = 1.05 - ((b.y + t * b.s) % 1.1), x = b.x * W + Math.sin(t + b.p) * 7;
      ctx.beginPath(); ctx.arc(x, y * H, b.r, 0, 7); ctx.strokeStyle = 'rgba(190,240,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  function drawBurst() {
    fctx.clearRect(0, 0, W, H);
    for (let i = burst.length - 1; i >= 0; i--) {
      const p = burst[i];
      p.x += p.vx; p.y += p.vy; p.vy -= .025; p.vx *= .985; p.life -= .011;
      if (p.life <= 0) { burst.splice(i, 1); continue; }
      fctx.beginPath(); fctx.arc(p.x, p.y, p.r, 0, 7);
      fctx.strokeStyle = `rgba(180,245,255,${p.life})`; fctx.lineWidth = 1.4; fctx.stroke();
      fctx.fillStyle = `rgba(116,230,255,${p.life * .16})`; fctx.fill();
    }
  }

  window.bubbleBurst = function () {
    if (still) return;
    for (let i = 0; i < 90; i++) burst.push({ x: W * (.3 + Math.random() * .4), y: H * .78 + Math.random() * 90, vx: (Math.random() - .5) * 3.2, vy: -Math.random() * 3.6 - .6, r: Math.random() * 7 + 2, life: Math.random() * .4 + .6 });
  };

  addEventListener('resize', size);
  addEventListener('scroll', () => { scrollDepth = scrollY / Math.max(700, document.body.scrollHeight - H); }, { passive: true });
  size();
  if (still) { frame(20); return; }
  (function loop(ms) { if (!document.hidden) { frame(ms / 1000 + 22); drawBurst(); } requestAnimationFrame(loop); })(0);
})();
