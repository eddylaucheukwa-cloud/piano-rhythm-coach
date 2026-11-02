// The reference frame comes from the original Chrome component, not a replacement design.
const imageUrl = new URL('./assets/chrome-background.png', import.meta.url);

export function createChromeBackground(panel) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) return { destroy() {} }; // The same frame remains visible as the CSS background.
  let disposed = false;
  const shaders = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const observer = new ResizeObserver(resize);
  function destroy() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    canvas.removeEventListener('chrome-tilt', move);
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    canvas.remove();
  }
  function shader(type, source) {
    const result = gl.createShader(type);
    shaders.push(result);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
    gl.attachShader(program, result);
  }
  let tilt;
  let offset = { x: 0, y: 0 };
  function resize() {
    canvas.width = Math.max(1, Math.round(panel.clientWidth));
    canvas.height = Math.max(1, Math.round(panel.clientHeight));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(tilt, -offset.x / canvas.width, offset.y / canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function move(event) {
    offset = event.detail;
    gl.uniform2f(tilt, -offset.x / canvas.width, offset.y / canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  try {
    shader(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}');
    shader(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 uv; uniform sampler2D chrome; uniform vec2 tilt;
      void main(){
        gl_FragColor=texture2D(chrome,clamp(uv+tilt,0.,1.));
      }`);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    tilt = gl.getUniformLocation(program, 'tilt');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      canvas.dataset.frameElementEffect = 'chrome-compatible';
      canvas.dataset.frameShaderReady = 'true';
      canvas.style.cssText = 'position:absolute!important;inset:0!important;width:100%!important;height:100%!important;pointer-events:none!important;z-index:-1!important;border-radius:inherit!important;';
      panel.append(canvas);
      observer.observe(panel);
      resize();
      canvas.addEventListener('chrome-tilt', move);
    };
    image.onerror = destroy;
    image.src = imageUrl.href;
    canvas.addEventListener('webglcontextlost', destroy, { once: true });
  } catch (error) {
    console.warn('Using the original static chrome lighting:', error);
    destroy();
  }
  return { destroy };
}

export function installTiltLighting(panel) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let origin;
  let active = false;
  function fit() {
    panel.style.zoom = '';
    panel.style.width = '';
    if (innerWidth > 600) return;
    panel.style.width = '374px';
    const body = getComputedStyle(document.body);
    const available = (window.visualViewport?.height ?? innerHeight) - parseFloat(body.paddingTop) - parseFloat(body.paddingBottom) - 5;
    panel.style.zoom = String(Math.min(1, (innerWidth - 16) / 374, available / panel.offsetHeight));
  }
  fit();
  document.fonts?.ready.then(fit);
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
  function apply(x = 0, y = 0) {
    panel.style.backgroundPosition = `calc(50% + ${x}px) calc(50% + ${y}px)`;
    for (const canvas of panel.querySelectorAll('[data-frame-element-effect]')) {
      if (canvas.dataset.frameElementEffect === 'chrome-compatible') {
        canvas.dispatchEvent(new CustomEvent('chrome-tilt', { detail: { x, y } }));
      } else {
        canvas.style.setProperty('transform', `translate(${x}px, ${y}px)`, 'important');
      }
    }
  }
  function orient(event) {
    if (reducedMotion.matches || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    origin ??= { beta: event.beta, gamma: event.gamma };
    const dx = Math.max(-30, Math.min(30, event.gamma - origin.gamma)) / 3;
    const dy = Math.max(-30, Math.min(30, event.beta - origin.beta)) / 3;
    const angle = ((screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180;
    apply(dx * Math.cos(angle) + dy * Math.sin(angle), dy * Math.cos(angle) - dx * Math.sin(angle));
  }
  function reset() { origin = undefined; apply(); }
  function start() {
    if (active) return;
    active = true;
    window.addEventListener('deviceorientation', orient);
    window.addEventListener('orientationchange', reset);
  }
  async function requestTilt() {
    try {
      if (await window.DeviceOrientationEvent.requestPermission() === 'granted') start();
    } catch { /* Keep the lighting still when sensor access is unavailable. */ }
  }
  if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
    panel.addEventListener('click', requestTilt, { once: true });
  } else if ('DeviceOrientationEvent' in window) start();
  reducedMotion.addEventListener('change', reset);
  return () => {
    window.removeEventListener('deviceorientation', orient);
    window.removeEventListener('orientationchange', reset);
    reducedMotion.removeEventListener('change', reset);
    panel.removeEventListener('click', requestTilt);
    window.removeEventListener('resize', fit);
    window.visualViewport?.removeEventListener('resize', fit);
    apply();
  };
}
