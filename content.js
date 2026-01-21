(() => {
  if (window.__screenDrawInitialized) {
    window.__screenDrawToggle?.();
    return;
  }
  window.__screenDrawInitialized = true;

  // Default keybindings
  const defaultKeybindings = {
    pointer: '1', pen: '2', highlighter: '3', eraser: '4', text: '5',
    arrow: 'a', rectangle: 'r', circle: 'c',
    undo: 'z', redo: 'y', screenshot: 's', clear: 'd', toggle: 'h'
  };

  let keybindings = { ...defaultKeybindings };

  const state = {
    active: true,
    tool: 'pen',
    color: '#3b82f6',
    size: 4,
    drawing: false,
    history: [],
    redoHistory: [],
    collapsed: false,
    shapesDropdownOpen: false
  };

  const colors = [
    ['#ef4444', '#22c55e'],
    ['#3b82f6', '#f59e0b']
  ];

  const shapeTools = ['arrow', 'rectangle', 'circle'];

  // Load keybindings from storage
  chrome.storage.local.get(['sd_keybindings'], (result) => {
    if (result.sd_keybindings) {
      keybindings = { ...defaultKeybindings, ...result.sd_keybindings };
      updateKeybindingsUI();
    }
  });

  function saveKeybindings() {
    chrome.storage.local.set({ sd_keybindings: keybindings });
  }

  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  const overlay = document.createElement('canvas');
  overlay.className = 'sd-overlay active';
  overlay.width = window.innerWidth;
  overlay.height = window.innerHeight;
  document.body.appendChild(overlay);

  let strokes = [];
  let currentStroke = null;
  let shapeStart = null;

  const ctx = overlay.getContext('2d', { willReadFrequently: false });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let offscreenCanvas = null;
  let offscreenCtx = null;

  function ensureOffscreenCanvas() {
    if (!offscreenCanvas || offscreenCanvas.width !== overlay.width || offscreenCanvas.height !== overlay.height) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = overlay.width;
      offscreenCanvas.height = overlay.height;
      offscreenCtx = offscreenCanvas.getContext('2d');
      offscreenCtx.lineCap = 'round';
      offscreenCtx.lineJoin = 'round';
    }
  }

  function throttle(fn, ms) {
    let lastCall = 0;
    let scheduled = null;
    return function(...args) {
      const now = performance.now();
      if (now - lastCall >= ms) { lastCall = now; fn.apply(this, args); }
      else if (!scheduled) {
        scheduled = requestAnimationFrame(() => { scheduled = null; lastCall = performance.now(); fn.apply(this, args); });
      }
    };
  }

  function debounce(fn, ms) {
    let timeout;
    return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), ms); };
  }

  function getPageCoords(e) { return { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }; }
  function getStorageKey() { return 'sd_' + window.location.href.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100); }
  function saveStrokes() { chrome.storage.local.set({ [getStorageKey()]: strokes }); }
  function loadStrokes() {
    chrome.storage.local.get([getStorageKey()], (result) => {
      if (result[getStorageKey()] && Array.isArray(result[getStorageKey()])) { strokes = result[getStorageKey()]; renderStrokes(); }
    });
  }

  function renderStrokes() {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const offsetX = window.scrollX, offsetY = window.scrollY;
    for (const stroke of strokes) drawStrokeToContext(ctx, stroke, offsetX, offsetY);
    if (currentStroke) drawStrokeToContext(ctx, currentStroke, offsetX, offsetY);
  }

  function drawStrokeToContext(c, stroke, offsetX, offsetY) {
    if (stroke.type === 'text') {
      c.font = `${stroke.size * 4}px Inter, sans-serif`;
      c.fillStyle = stroke.color;
      c.globalAlpha = 1;
      c.fillText(stroke.text, stroke.x - offsetX, stroke.y - offsetY);
    } else if (stroke.type === 'rectangle') {
      c.strokeStyle = stroke.color; c.lineWidth = stroke.size; c.globalAlpha = stroke.alpha || 1;
      c.beginPath(); c.rect(stroke.x - offsetX, stroke.y - offsetY, stroke.width, stroke.height); c.stroke(); c.globalAlpha = 1;
    } else if (stroke.type === 'circle') {
      c.strokeStyle = stroke.color; c.lineWidth = stroke.size; c.globalAlpha = stroke.alpha || 1;
      c.beginPath(); c.ellipse(stroke.cx - offsetX, stroke.cy - offsetY, Math.abs(stroke.rx), Math.abs(stroke.ry), 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    } else if (stroke.type === 'arrow') {
      const { x1, y1, x2, y2, color, size } = stroke;
      const headLen = Math.max(size * 4, 15), angle = Math.atan2(y2 - y1, x2 - x1);
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = size; c.globalAlpha = stroke.alpha || 1;
      c.beginPath(); c.moveTo(x1 - offsetX, y1 - offsetY); c.lineTo(x2 - offsetX, y2 - offsetY); c.stroke();
      c.beginPath(); c.moveTo(x2 - offsetX, y2 - offsetY);
      c.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6) - offsetX, y2 - headLen * Math.sin(angle - Math.PI / 6) - offsetY);
      c.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6) - offsetX, y2 - headLen * Math.sin(angle + Math.PI / 6) - offsetY);
      c.closePath(); c.fill(); c.globalAlpha = 1;
    } else if (stroke.points && stroke.points.length >= 2) {
      const pts = stroke.points;
      c.strokeStyle = stroke.color; c.lineWidth = stroke.size; c.globalAlpha = stroke.alpha;
      c.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
      c.beginPath(); c.moveTo(pts[0].x - offsetX, pts[0].y - offsetY);
      if (pts.length === 2) { c.lineTo(pts[1].x - offsetX, pts[1].y - offsetY); }
      else {
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
          c.bezierCurveTo(p1.x + (p2.x - p0.x) / 10 - offsetX, p1.y + (p2.y - p0.y) / 10 - offsetY,
            p2.x - (p3.x - p1.x) / 10 - offsetX, p2.y - (p3.y - p1.y) / 10 - offsetY, p2.x - offsetX, p2.y - offsetY);
        }
      }
      c.stroke(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  }

  const sidebar = document.createElement('div');
  sidebar.className = 'sd-sidebar';
  sidebar.innerHTML = `
    <button class="sd-toggle-tab" title="Toggle sidebar">
      <span class="material-symbols-rounded">chevron_right</span>
    </button>
    <div class="sd-content">
      <div class="sd-section">
        <span class="sd-label">Tools</span>
        <button class="sd-tool-btn" data-tool="pointer" title="Pointer"><span class="material-symbols-rounded">arrow_selector_tool</span></button>
        <button class="sd-tool-btn active" data-tool="pen" title="Pen"><span class="material-symbols-rounded">edit</span></button>
        <button class="sd-tool-btn" data-tool="highlighter" title="Highlighter"><span class="material-symbols-rounded">ink_highlighter</span></button>
        <button class="sd-tool-btn" data-tool="text" title="Text"><span class="material-symbols-rounded">title</span></button>
        <button class="sd-tool-btn" data-tool="eraser" title="Eraser"><span class="material-symbols-rounded">ink_eraser</span></button>
        <div class="sd-dropdown-wrapper">
          <button class="sd-tool-btn sd-shapes-btn" data-tool="shapes" title="Shapes"><span class="material-symbols-rounded sd-shape-icon">shapes</span></button>
          <div class="sd-shapes-dropdown">
            <button class="sd-dropdown-item" data-tool="arrow"><span class="material-symbols-rounded">arrow_right_alt</span><span>Arrow</span></button>
            <button class="sd-dropdown-item" data-tool="rectangle"><span class="material-symbols-rounded">rectangle</span><span>Rectangle</span></button>
            <button class="sd-dropdown-item" data-tool="circle"><span class="material-symbols-rounded">circle</span><span>Circle</span></button>
          </div>
        </div>
      </div>
      <div class="sd-section">
        <span class="sd-label">Color</span>
        <div class="sd-colors"></div>
      </div>
      <div class="sd-section">
        <span class="sd-label">Size</span>
        <div class="sd-size-container">
          <input type="range" class="sd-size-slider" min="1" max="50" value="4">
          <span class="sd-size-value">4px</span>
        </div>
      </div>
      <div class="sd-section">
        <span class="sd-label">Actions</span>
        <button class="sd-action-btn" data-action="undo" title="Undo"><span class="material-symbols-rounded">undo</span></button>
        <button class="sd-action-btn" data-action="redo" title="Redo"><span class="material-symbols-rounded">redo</span></button>
        <button class="sd-action-btn" data-action="screenshot" title="Screenshot"><span class="material-symbols-rounded">photo_camera</span></button>
        <button class="sd-action-btn danger" data-action="clear" title="Clear"><span class="material-symbols-rounded">delete</span></button>
        <button class="sd-action-btn sd-info-btn" data-action="info" title="Settings"><span class="material-symbols-rounded">settings</span></button>
      </div>
    </div>
    <div class="sd-info-popup">
      <div class="sd-info-header">
        <span>Keyboard Shortcuts</span>
        <button class="sd-info-close"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="sd-info-content">
        <div class="sd-keybind" data-action="pointer"><span class="sd-keybind-label">Pointer</span><input class="sd-keybind-input" maxlength="1" value="1"></div>
        <div class="sd-keybind" data-action="pen"><span class="sd-keybind-label">Pen</span><input class="sd-keybind-input" maxlength="1" value="2"></div>
        <div class="sd-keybind" data-action="highlighter"><span class="sd-keybind-label">Highlighter</span><input class="sd-keybind-input" maxlength="1" value="3"></div>
        <div class="sd-keybind" data-action="eraser"><span class="sd-keybind-label">Eraser</span><input class="sd-keybind-input" maxlength="1" value="4"></div>
        <div class="sd-keybind" data-action="text"><span class="sd-keybind-label">Text</span><input class="sd-keybind-input" maxlength="1" value="5"></div>
        <div class="sd-keybind" data-action="arrow"><span class="sd-keybind-label">Arrow</span><input class="sd-keybind-input" maxlength="1" value="a"></div>
        <div class="sd-keybind" data-action="rectangle"><span class="sd-keybind-label">Rectangle</span><input class="sd-keybind-input" maxlength="1" value="r"></div>
        <div class="sd-keybind" data-action="circle"><span class="sd-keybind-label">Circle</span><input class="sd-keybind-input" maxlength="1" value="c"></div>
        <div class="sd-keybind" data-action="undo"><span class="sd-keybind-label">Undo</span><input class="sd-keybind-input" maxlength="1" value="z"></div>
        <div class="sd-keybind" data-action="redo"><span class="sd-keybind-label">Redo</span><input class="sd-keybind-input" maxlength="1" value="y"></div>
        <div class="sd-keybind" data-action="screenshot"><span class="sd-keybind-label">Screenshot</span><input class="sd-keybind-input" maxlength="1" value="s"></div>
        <div class="sd-keybind" data-action="clear"><span class="sd-keybind-label">Clear</span><input class="sd-keybind-input" maxlength="1" value="d"></div>
        <div class="sd-keybind" data-action="toggle"><span class="sd-keybind-label">Toggle sidebar</span><input class="sd-keybind-input" maxlength="1" value="h"></div>
      </div>
      <div class="sd-info-footer">
        <button class="sd-reset-keybinds">Reset to defaults</button>
      </div>
    </div>
  `;
  document.body.appendChild(sidebar);

  // Keybindings UI
  function updateKeybindingsUI() {
    sidebar.querySelectorAll('.sd-keybind').forEach(row => {
      const action = row.dataset.action;
      const input = row.querySelector('.sd-keybind-input');
      if (keybindings[action]) input.value = keybindings[action];
    });
  }

  sidebar.querySelectorAll('.sd-keybind-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const action = e.target.closest('.sd-keybind').dataset.action;
      keybindings[action] = e.target.value.toLowerCase();
      saveKeybindings();
    });
    input.addEventListener('focus', () => input.select());
  });

  sidebar.querySelector('.sd-reset-keybinds').addEventListener('click', () => {
    keybindings = { ...defaultKeybindings };
    updateKeybindingsUI();
    saveKeybindings();
  });

  // Shapes dropdown
  const shapesBtn = sidebar.querySelector('.sd-shapes-btn');
  const shapesDropdown = sidebar.querySelector('.sd-shapes-dropdown');
  const shapeIcon = sidebar.querySelector('.sd-shape-icon');

  shapesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.shapesDropdownOpen = !state.shapesDropdownOpen;
    shapesDropdown.classList.toggle('open', state.shapesDropdownOpen);
  });

  shapesDropdown.querySelectorAll('.sd-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const tool = item.dataset.tool;
      setTool(tool);
      shapeIcon.textContent = { arrow: 'arrow_right_alt', rectangle: 'rectangle', circle: 'circle' }[tool];
      shapesDropdown.classList.remove('open');
      state.shapesDropdownOpen = false;
    });
  });

  document.addEventListener('click', () => {
    if (state.shapesDropdownOpen) { shapesDropdown.classList.remove('open'); state.shapesDropdownOpen = false; }
  });

  // Colors
  const colorsContainer = sidebar.querySelector('.sd-colors');
  colors.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'sd-color-row';
    row.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'sd-color-btn' + (c === state.color ? ' active' : '');
      btn.style.background = c;
      btn.dataset.color = c;
      rowDiv.appendChild(btn);
    });
    colorsContainer.appendChild(rowDiv);
  });

  const pickerRow = document.createElement('div');
  pickerRow.className = 'sd-color-row';
  const pickerWrapper = document.createElement('div');
  pickerWrapper.className = 'sd-color-picker-wrapper';
  pickerWrapper.style.cursor = 'pointer';
  const pickerIconEl = document.createElement('div');
  pickerIconEl.className = 'sd-picker-icon';
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'sd-color-picker';
  picker.value = state.color;
  pickerWrapper.appendChild(pickerIconEl);
  pickerWrapper.appendChild(picker);
  pickerRow.appendChild(pickerWrapper);
  colorsContainer.appendChild(pickerRow);

  picker.addEventListener('input', (e) => {
    setColor(e.target.value);
    colorsContainer.querySelectorAll('.sd-color-btn').forEach(b => b.classList.remove('active'));
  });

  // Event handlers
  const toggleTab = sidebar.querySelector('.sd-toggle-tab');
  const sizeSlider = sidebar.querySelector('.sd-size-slider');
  const sizeValue = sidebar.querySelector('.sd-size-value');

  toggleTab.addEventListener('click', toggleCollapse);
  sidebar.querySelectorAll('.sd-tool-btn:not(.sd-shapes-btn)').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
  colorsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('sd-color-btn')) setColor(e.target.dataset.color);
  });
  sizeSlider.addEventListener('input', (e) => {
    state.size = parseInt(e.target.value);
    sizeValue.textContent = state.size + 'px';
  });

  sidebar.querySelectorAll('.sd-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'undo') undo();
      else if (a === 'redo') redo();
      else if (a === 'clear') clearCanvas();
      else if (a === 'screenshot') takeScreenshot();
      else if (a === 'info') toggleInfo();
    });
  });

  const infoPopup = sidebar.querySelector('.sd-info-popup');
  const infoClose = sidebar.querySelector('.sd-info-close');
  function toggleInfo() { infoPopup.classList.toggle('visible'); }
  infoClose.addEventListener('click', () => infoPopup.classList.remove('visible'));

  let textInput = null;
  function createTextInput(x, y, pageX, pageY) {
    if (textInput) { textInput.remove(); textInput = null; }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sd-text-input';
    input.style.cssText = `position:fixed;left:${x}px;top:${y - state.size * 2}px;font-size:${state.size * 4}px;color:${state.color};background:rgba(255,255,255,0.9);border:2px solid ${state.color};outline:none;padding:4px 8px;font-family:Inter,sans-serif;z-index:2147483648;min-width:100px;border-radius:4px;`;
    document.body.appendChild(input);
    textInput = input;
    setTimeout(() => input.focus(), 10);
    function commitText() {
      if (input.value.trim()) {
        pushHistory();
        strokes.push({ type: 'text', x: pageX, y: pageY, text: input.value, color: state.color, size: state.size });
        renderStrokes();
        saveStrokes();
      }
      input.remove();
      if (textInput === input) textInput = null;
    }
    input.addEventListener('blur', () => setTimeout(commitText, 100));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { input.value = ''; input.blur(); }
    });
  }

  function pushHistory() {
    state.history.push(JSON.parse(JSON.stringify(strokes)));
    if (state.history.length > 30) state.history.shift();
    state.redoHistory = [];
  }

  // Drawing
  let points = [];
  overlay.addEventListener('mousedown', startDraw);
  overlay.addEventListener('mousemove', throttle(draw, 8));
  overlay.addEventListener('mouseup', endDraw);
  overlay.addEventListener('mouseleave', endDraw);

  function startDraw(e) {
    if (!state.active) return;
    if (state.tool === 'text') {
      e.preventDefault(); e.stopPropagation();
      const coords = getPageCoords(e);
      createTextInput(e.clientX, e.clientY, coords.x, coords.y);
      return;
    }
    state.drawing = true;
    const coords = getPageCoords(e);
    if (shapeTools.includes(state.tool)) {
      shapeStart = coords;
      if (state.tool === 'arrow') currentStroke = { type: 'arrow', x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y, color: state.color, size: state.size };
      else if (state.tool === 'rectangle') currentStroke = { type: 'rectangle', x: coords.x, y: coords.y, width: 0, height: 0, color: state.color, size: state.size };
      else if (state.tool === 'circle') currentStroke = { type: 'circle', cx: coords.x, cy: coords.y, rx: 0, ry: 0, color: state.color, size: state.size };
      return;
    }
    points = [coords];
    currentStroke = { points: [coords], color: state.color, size: state.tool === 'eraser' ? state.size * 3 : state.size, alpha: state.tool === 'highlighter' ? 0.4 : 1, eraser: state.tool === 'eraser' };
  }

  function draw(e) {
    if (!state.drawing || !state.active) return;
    const coords = getPageCoords(e);
    if (state.tool === 'arrow' && currentStroke) { currentStroke.x2 = coords.x; currentStroke.y2 = coords.y; renderStrokes(); return; }
    if (state.tool === 'rectangle' && currentStroke && shapeStart) {
      currentStroke.x = Math.min(shapeStart.x, coords.x); currentStroke.y = Math.min(shapeStart.y, coords.y);
      currentStroke.width = Math.abs(coords.x - shapeStart.x); currentStroke.height = Math.abs(coords.y - shapeStart.y);
      renderStrokes(); return;
    }
    if (state.tool === 'circle' && currentStroke && shapeStart) {
      currentStroke.cx = (shapeStart.x + coords.x) / 2; currentStroke.cy = (shapeStart.y + coords.y) / 2;
      currentStroke.rx = Math.abs(coords.x - shapeStart.x) / 2; currentStroke.ry = Math.abs(coords.y - shapeStart.y) / 2;
      renderStrokes(); return;
    }
    points.push(coords);
    currentStroke.points = points;
    renderStrokes();
  }

  function endDraw() {
    if (!state.drawing) return;
    if (shapeTools.includes(state.tool) && currentStroke) {
      pushHistory(); strokes.push(currentStroke);
      currentStroke = null; shapeStart = null; state.drawing = false;
      renderStrokes(); saveStrokes(); return;
    }
    if (points.length >= 2) {
      currentStroke.points = simplifyPath(points, 0.85);
      pushHistory(); strokes.push(currentStroke); saveStrokes();
    }
    currentStroke = null; state.drawing = false; points = [];
    renderStrokes();
  }

  function simplifyPath(pts, tol) {
    if (pts.length <= 2) return pts;
    let maxD = 0, maxI = 0;
    const s = pts[0], e = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) { const d = perpDist(pts[i], s, e); if (d > maxD) { maxD = d; maxI = i; } }
    if (maxD > tol) { const l = simplifyPath(pts.slice(0, maxI + 1), tol), r = simplifyPath(pts.slice(maxI), tol); return l.slice(0, -1).concat(r); }
    return [s, e];
  }

  function perpDist(p, ls, le) {
    const dx = le.x - ls.x, dy = le.y - ls.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return Math.sqrt((p.x - ls.x) ** 2 + (p.y - ls.y) ** 2);
    const t = Math.max(0, Math.min(1, ((p.x - ls.x) * dx + (p.y - ls.y) * dy) / (len * len)));
    return Math.sqrt((p.x - (ls.x + t * dx)) ** 2 + (p.y - (ls.y + t * dy)) ** 2);
  }

  function setTool(tool) {
    state.tool = tool;
    sidebar.querySelectorAll('.sd-tool-btn').forEach(b => {
      const isShapesBtn = b.classList.contains('sd-shapes-btn');
      if (isShapesBtn) b.classList.toggle('active', shapeTools.includes(tool));
      else if (!shapeTools.includes(b.dataset.tool)) b.classList.toggle('active', b.dataset.tool === tool);
    });
    shapesDropdown.querySelectorAll('.sd-dropdown-item').forEach(item => item.classList.toggle('active', item.dataset.tool === tool));
    if (tool === 'pointer') { overlay.style.pointerEvents = 'none'; overlay.classList.add('pointer-mode'); }
    else { overlay.style.pointerEvents = 'auto'; overlay.classList.remove('pointer-mode'); }
    overlay.style.cursor = tool === 'text' ? 'text' : '';
    overlay.style.display = 'none'; overlay.offsetHeight; overlay.style.display = '';
  }

  function setColor(color) {
    state.color = color;
    colorsContainer.querySelectorAll('.sd-color-btn').forEach(b => b.classList.toggle('active', b.dataset.color === color));
  }

  function undo() {
    if (state.history.length) {
      state.redoHistory.push(JSON.parse(JSON.stringify(strokes)));
      if (state.redoHistory.length > 30) state.redoHistory.shift();
      strokes = state.history.pop();
      renderStrokes(); saveStrokes();
    }
  }

  function redo() {
    if (state.redoHistory.length) {
      state.history.push(JSON.parse(JSON.stringify(strokes)));
      if (state.history.length > 30) state.history.shift();
      strokes = state.redoHistory.pop();
      renderStrokes(); saveStrokes();
    }
  }

  function clearCanvas() { pushHistory(); strokes = []; renderStrokes(); saveStrokes(); }
  function toggleCollapse() { state.collapsed = !state.collapsed; sidebar.classList.toggle('collapsed', state.collapsed); }
  function toggle() { state.active = !state.active; overlay.classList.toggle('active', state.active); sidebar.classList.toggle('sd-hidden', !state.active); }

  function takeScreenshot() {
    overlay.style.visibility = 'hidden';
    sidebar.style.visibility = 'hidden';
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'capture-screenshot' }, (response) => {
        overlay.style.visibility = 'visible';
        sidebar.style.visibility = 'visible';
        if (response && response.dataUrl) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const c = canvas.getContext('2d');
            c.drawImage(img, 0, 0);
            c.lineCap = 'round'; c.lineJoin = 'round';
            for (const stroke of strokes) drawStrokeToContext(c, stroke, window.scrollX, window.scrollY);
            const link = document.createElement('a');
            link.download = `screenshot-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
          };
          img.src = response.dataUrl;
        }
      });
    }, 50);
  }

  window.__screenDrawToggle = toggle;

  // Keyboard shortcuts - using customizable keybindings
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && state.active) {
      const key = e.key.toLowerCase();
      if (key === keybindings.pointer) setTool('pointer');
      else if (key === keybindings.pen) setTool('pen');
      else if (key === keybindings.highlighter) setTool('highlighter');
      else if (key === keybindings.eraser) setTool('eraser');
      else if (key === keybindings.text) setTool('text');
      else if (key === keybindings.arrow) { setTool('arrow'); shapeIcon.textContent = 'arrow_right_alt'; }
      else if (key === keybindings.rectangle) { setTool('rectangle'); shapeIcon.textContent = 'rectangle'; }
      else if (key === keybindings.circle) { setTool('circle'); shapeIcon.textContent = 'circle'; }
      else if (key === keybindings.undo) { e.preventDefault(); undo(); }
      else if (key === keybindings.redo) { e.preventDefault(); redo(); }
      else if (key === keybindings.screenshot) { e.preventDefault(); takeScreenshot(); }
      else if (key === keybindings.clear) { e.preventDefault(); clearCanvas(); }
      else if (key === keybindings.toggle) { e.preventDefault(); toggleCollapse(); }
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') toggle();
    else if (msg.action === 'clear-canvas') clearCanvas();
    else if (msg.action === 'undo') undo();
  });

  const updateCanvasSize = debounce(() => {
    if (window.innerWidth !== overlay.width || window.innerHeight !== overlay.height) {
      ensureOffscreenCanvas();
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      offscreenCtx.drawImage(overlay, 0, 0);
      overlay.width = window.innerWidth; overlay.height = window.innerHeight;
      ctx.drawImage(offscreenCanvas, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      offscreenCanvas = null;
    }
  }, 150);

  window.addEventListener('resize', updateCanvasSize);
  window.addEventListener('scroll', () => requestAnimationFrame(renderStrokes), { passive: true });

  loadStrokes();
})();
