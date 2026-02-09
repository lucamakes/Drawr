(() => {
  if (window.__screenDrawInitialized) {
    window.__screenDrawToggle?.();
    return;
  }
  window.__screenDrawInitialized = true;

  // Default keybindings
  const defaultKeybindings = {
    pointer: '1', pen: '2', highlighter: '3', eraser: '4', text: '5',
    move: 'm', line: 'l', arrow: 'a', rectangle: 'r', circle: 'c',
    undo: 'z', redo: 'y', screenshot: 's', fullscreenshot: 'f', clear: 'd', toggle: 'h'
  };

  let keybindings = { ...defaultKeybindings };

  const state = {
    active: true,
    tool: 'pen',
    color: '#3b82f6',
    size: 4,
    collapsed: false,
    screenshotDropdownOpen: false
  };

  const colors = [
    ['#ef4444', '#22c55e'],
    ['#3b82f6', '#f59e0b']
  ];

  const shapeTools = ['arrow', 'rectangle', 'circle', 'line'];
  const drawTools = ['pen', 'highlighter', 'eraser'];

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

  // Convert hex to rgba for highlighter
  function hexToRgba(hex, alpha = 0.4) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Load Inter font for UI text
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  // Calculate canvas dimensions - start with viewport only for better performance
  const viewportHeight = window.innerHeight;
  const viewportWidth = document.documentElement.scrollWidth || window.innerWidth;
  
  // Create Fabric canvas with performance optimizations
  const canvasEl = document.createElement('canvas');
  canvasEl.id = 'sd-fabric-canvas';
  document.body.appendChild(canvasEl);

  // Performance: Configure fabric defaults before creating canvas
  fabric.Object.prototype.objectCaching = true;
  fabric.Object.prototype.statefullCache = false;
  fabric.Object.prototype.noScaleCache = true;

  const canvas = new fabric.Canvas('sd-fabric-canvas', {
    isDrawingMode: true,
    width: viewportWidth,
    height: viewportHeight + 1000, // Start with viewport + buffer
    selection: true,
    renderOnAddRemove: false, // Manual render control for batching
    skipTargetFind: false,
    enableRetinaScaling: false, // Disable retina for performance
    stopContextMenu: true
  });

  canvas.wrapperEl.className = 'sd-overlay active';
  canvas.wrapperEl.style.cssText = 'position:absolute;top:0;left:0;z-index:2147483646;';
  canvas.freeDrawingBrush.color = state.color;
  canvas.freeDrawingBrush.width = state.size;

  // Performance: Throttled render function
  let renderPending = false;
  function requestRender() {
    if (!renderPending) {
      renderPending = true;
      requestAnimationFrame(() => {
        canvas.renderAll();
        renderPending = false;
      });
    }
  }

  // History management with debounced saves
  let historyStack = [];
  let redoStack = [];
  let currentState = null;
  let saveTimeout = null;

  function saveState() {
    // Debounce state saves to avoid excessive JSON serialization
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (currentState) {
        historyStack.push(currentState);
        if (historyStack.length > 20) historyStack.shift(); // Reduced from 30
      }
      redoStack = [];
      currentState = JSON.stringify(canvas);
    }, 100);
  }

  function saveStateImmediate() {
    clearTimeout(saveTimeout);
    if (currentState) {
      historyStack.push(currentState);
      if (historyStack.length > 20) historyStack.shift();
    }
    redoStack = [];
    currentState = JSON.stringify(canvas);
  }

  function undo() {
    if (historyStack.length > 0) {
      redoStack.push(currentState);
      currentState = historyStack.pop();
      canvas.loadFromJSON(currentState, () => {
        canvas.renderAll();
        // Re-apply tool settings after load
        setTool(state.tool);
      });
    }
  }

  function redo() {
    if (redoStack.length > 0) {
      historyStack.push(currentState);
      currentState = redoStack.pop();
      canvas.loadFromJSON(currentState, () => {
        canvas.renderAll();
        setTool(state.tool);
      });
    }
  }

  // Shape drawing variables
  let isDrawingShape = false;
  let shapeStart = null;
  let currentShape = null;


  // Helper to get icon URL
  function iconUrl(name) {
    return chrome.runtime.getURL(`icons/${name}.svg`);
  }

  // Sidebar HTML
  const sidebar = document.createElement('div');
  sidebar.className = 'sd-sidebar';
  sidebar.innerHTML = `
    <button class="sd-toggle-tab" title="Toggle sidebar">
      <img class="sd-icon" src="${iconUrl('chevron_right')}" alt="">
    </button>
    <div class="sd-content">
      <div class="sd-section">
        <span class="sd-label">Tools</span>
        <button class="sd-tool-btn" data-tool="pointer" title="Pointer"><img class="sd-icon" src="${iconUrl('arrow_selector_tool')}" alt=""></button>
        <button class="sd-tool-btn active" data-tool="pen" title="Pen"><img class="sd-icon" src="${iconUrl('edit')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="highlighter" title="Highlighter"><img class="sd-icon" src="${iconUrl('ink_highlighter')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="eraser" title="Eraser"><img class="sd-icon" src="${iconUrl('ink_eraser')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="text" title="Text"><img class="sd-icon" src="${iconUrl('title')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="move" title="Move"><img class="sd-icon" src="${iconUrl('open_with')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="arrow" title="Arrow"><img class="sd-icon" src="${iconUrl('arrow_right_alt')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="rectangle" title="Rectangle"><img class="sd-icon" src="${iconUrl('rectangle')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="circle" title="Circle"><img class="sd-icon" src="${iconUrl('circle')}" alt=""></button>
        <button class="sd-tool-btn" data-tool="line" title="Line"><img class="sd-icon" src="${iconUrl('horizontal_rule')}" alt=""></button>
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
        <button class="sd-action-btn" data-action="undo" title="Undo"><img class="sd-icon" src="${iconUrl('undo')}" alt=""></button>
        <button class="sd-action-btn" data-action="redo" title="Redo"><img class="sd-icon" src="${iconUrl('redo')}" alt=""></button>
        <div class="sd-dropdown-wrapper">
          <button class="sd-action-btn sd-screenshot-btn" data-action="screenshot-menu" title="Screenshot"><img class="sd-icon" src="${iconUrl('photo_camera')}" alt=""></button>
          <div class="sd-screenshot-dropdown">
            <button class="sd-dropdown-item" data-action="screenshot">Visible area</button>
            <button class="sd-dropdown-item" data-action="areashot">Select area</button>
            <button class="sd-dropdown-item" data-action="fullscreenshot">Full page</button>
          </div>
        </div>
        <button class="sd-action-btn danger" data-action="clear" title="Clear"><img class="sd-icon" src="${iconUrl('delete')}" alt=""></button>
        <button class="sd-action-btn sd-info-btn" data-action="info" title="Settings"><img class="sd-icon" src="${iconUrl('settings')}" alt=""></button>
      </div>
      <a class="sd-donate-btn" href="https://ko-fi.com/" target="_blank" rel="noopener noreferrer" title="Buy me a coffee">
        <svg class="sd-kofi-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-2.866-2.596-3.935-4.079c-1.093-1.48-.376-3.573 1.39-3.573 1.124 0 1.869.776 2.321 1.41.449-.634 1.197-1.41 2.321-1.41 1.766 0 2.482 2.093 1.914 3.676z"/></svg>
        <span>Donate</span>
      </a>
    </div>
    <div class="sd-info-popup">
      <div class="sd-info-header">
        <span>Keyboard Shortcuts</span>
        <button class="sd-info-close"><img class="sd-icon" src="${iconUrl('close')}" alt=""></button>
      </div>
      <div class="sd-info-content">
        <div class="sd-keybind" data-action="pointer"><span class="sd-keybind-label">Pointer</span><input class="sd-keybind-input" maxlength="1" value="1"></div>
        <div class="sd-keybind" data-action="pen"><span class="sd-keybind-label">Pen</span><input class="sd-keybind-input" maxlength="1" value="2"></div>
        <div class="sd-keybind" data-action="highlighter"><span class="sd-keybind-label">Highlighter</span><input class="sd-keybind-input" maxlength="1" value="3"></div>
        <div class="sd-keybind" data-action="eraser"><span class="sd-keybind-label">Eraser</span><input class="sd-keybind-input" maxlength="1" value="4"></div>
        <div class="sd-keybind" data-action="text"><span class="sd-keybind-label">Text</span><input class="sd-keybind-input" maxlength="1" value="5"></div>
        <div class="sd-keybind" data-action="move"><span class="sd-keybind-label">Move</span><input class="sd-keybind-input" maxlength="1" value="m"></div>
        <div class="sd-keybind" data-action="line"><span class="sd-keybind-label">Line</span><input class="sd-keybind-input" maxlength="1" value="l"></div>
        <div class="sd-keybind" data-action="arrow"><span class="sd-keybind-label">Arrow</span><input class="sd-keybind-input" maxlength="1" value="a"></div>
        <div class="sd-keybind" data-action="rectangle"><span class="sd-keybind-label">Rectangle</span><input class="sd-keybind-input" maxlength="1" value="r"></div>
        <div class="sd-keybind" data-action="circle"><span class="sd-keybind-label">Circle</span><input class="sd-keybind-input" maxlength="1" value="c"></div>
        <div class="sd-keybind" data-action="undo"><span class="sd-keybind-label">Undo</span><input class="sd-keybind-input" maxlength="1" value="z"></div>
        <div class="sd-keybind" data-action="redo"><span class="sd-keybind-label">Redo</span><input class="sd-keybind-input" maxlength="1" value="y"></div>
        <div class="sd-keybind" data-action="screenshot"><span class="sd-keybind-label">Screenshot</span><input class="sd-keybind-input" maxlength="1" value="s"></div>
        <div class="sd-keybind" data-action="fullscreenshot"><span class="sd-keybind-label">Full page screenshot</span><input class="sd-keybind-input" maxlength="1" value="f"></div>
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


  // Screenshot dropdown
  const screenshotBtn = sidebar.querySelector('.sd-screenshot-btn');
  const screenshotDropdown = sidebar.querySelector('.sd-screenshot-dropdown');

  document.addEventListener('click', () => {
    if (state.screenshotDropdownOpen) { screenshotDropdown.classList.remove('open'); state.screenshotDropdownOpen = false; }
  });

  screenshotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.screenshotDropdownOpen = !state.screenshotDropdownOpen;
    screenshotDropdown.classList.toggle('open', state.screenshotDropdownOpen);
  });

  screenshotDropdown.querySelectorAll('.sd-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      if (action === 'screenshot') takeScreenshot();
      else if (action === 'areashot') startAreaScreenshot();
      else if (action === 'fullscreenshot') takeFullPageScreenshot();
      screenshotDropdown.classList.remove('open');
      state.screenshotDropdownOpen = false;
    });
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
  sidebar.querySelectorAll('.sd-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
  colorsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('sd-color-btn')) setColor(e.target.dataset.color);
  });
  sizeSlider.addEventListener('input', (e) => {
    state.size = parseInt(e.target.value);
    sizeValue.textContent = state.size + 'px';
    updateBrushSize();
  });

  sidebar.querySelectorAll('.sd-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'undo') undo();
      else if (a === 'redo') redo();
      else if (a === 'clear') clearCanvas();
      else if (a === 'info') toggleInfo();
    });
  });

  const infoPopup = sidebar.querySelector('.sd-info-popup');
  const infoClose = sidebar.querySelector('.sd-info-close');
  function toggleInfo() { infoPopup.classList.toggle('visible'); }
  infoClose.addEventListener('click', () => infoPopup.classList.remove('visible'));


  // Tool functions
  function setTool(tool) {
    state.tool = tool;
    canvas.discardActiveObject().renderAll();
    
    // Update UI - simple active toggle for all tool buttons
    sidebar.querySelectorAll('.sd-tool-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });

    // Configure canvas based on tool
    if (tool === 'pointer') {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.wrapperEl.style.pointerEvents = 'none';
      canvas.getObjects().forEach(obj => { obj.selectable = false; obj.hoverCursor = 'default'; });
    } else if (tool === 'move') {
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.wrapperEl.style.pointerEvents = 'auto';
      canvas.wrapperEl.style.cursor = 'default';
      canvas.getObjects().forEach(obj => { 
        obj.selectable = true; 
        obj.hoverCursor = obj.type === 'i-text' ? 'text' : 'move';
      });
    } else if (tool === 'text') {
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.wrapperEl.style.pointerEvents = 'auto';
      canvas.wrapperEl.style.cursor = 'text';
      // Make existing text objects selectable/editable
      canvas.getObjects().forEach(obj => { 
        if (obj.type === 'i-text') {
          obj.selectable = true;
          obj.hoverCursor = 'text';
        } else {
          obj.selectable = false;
        }
      });
    } else if (tool === 'eraser') {
      canvas.isDrawingMode = true;
      canvas.selection = false;
      canvas.wrapperEl.style.pointerEvents = 'auto';
      canvas.wrapperEl.style.cursor = 'crosshair';
      if (fabric.EraserBrush) {
        canvas.freeDrawingBrush = new fabric.EraserBrush(canvas);
        canvas.freeDrawingBrush.width = state.size * 3;
      }
      canvas.getObjects().forEach(obj => { obj.selectable = false; });
    } else if (tool === 'pen' || tool === 'highlighter') {
      canvas.isDrawingMode = true;
      canvas.selection = false;
      canvas.wrapperEl.style.pointerEvents = 'auto';
      canvas.wrapperEl.style.cursor = 'crosshair';
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      if (tool === 'highlighter') {
        canvas.freeDrawingBrush.color = hexToRgba(state.color, 0.4);
        canvas.freeDrawingBrush.width = state.size * 4;
      } else {
        canvas.freeDrawingBrush.color = state.color;
        canvas.freeDrawingBrush.width = state.size;
      }
      canvas.getObjects().forEach(obj => { obj.selectable = false; });
    } else if (shapeTools.includes(tool)) {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.wrapperEl.style.pointerEvents = 'auto';
      canvas.wrapperEl.style.cursor = 'crosshair';
      canvas.getObjects().forEach(obj => { obj.selectable = false; });
    }
  }

  function setColor(color) {
    state.color = color;
    colorsContainer.querySelectorAll('.sd-color-btn').forEach(b => b.classList.toggle('active', b.dataset.color === color));
    
    if (state.tool === 'highlighter') {
      canvas.freeDrawingBrush.color = hexToRgba(color, 0.4);
    } else if (state.tool === 'pen') {
      canvas.freeDrawingBrush.color = color;
    }
  }

  function updateBrushSize() {
    if (state.tool === 'eraser' && fabric.EraserBrush) {
      canvas.freeDrawingBrush.width = state.size * 3;
    } else if (state.tool === 'highlighter') {
      canvas.freeDrawingBrush.width = state.size * 4;
    } else if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = state.size;
    }
  }

  function clearCanvas() {
    saveStateImmediate();
    canvas.clear();
    requestRender();
  }

  function toggleCollapse() {
    state.collapsed = !state.collapsed;
    sidebar.classList.toggle('collapsed', state.collapsed);
  }

  function toggle() {
    state.active = !state.active;
    canvas.wrapperEl.classList.toggle('active', state.active);
    sidebar.classList.toggle('sd-visible', state.active);
    sidebar.classList.toggle('sd-hidden', !state.active);
  }


  // Shape drawing with mouse events
  canvas.on('mouse:down', function(opt) {
    if (state.tool === 'text' && !canvas.getActiveObject()) {
      const pointer = canvas.getPointer(opt.e);
      const text = new fabric.IText('', {
        left: pointer.x,
        top: pointer.y,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: state.size * 4,
        fill: state.color,
        selectable: true
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      text.enterEditing();
      return;
    }

    if (!shapeTools.includes(state.tool)) return;
    
    isDrawingShape = true;
    const pointer = canvas.getPointer(opt.e);
    shapeStart = { x: pointer.x, y: pointer.y };

    if (state.tool === 'line') {
      currentShape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: state.color,
        strokeWidth: state.size,
        selectable: false,
        hoverCursor: 'default',
        objectCaching: false // Disable during drawing for responsiveness
      });
    } else if (state.tool === 'arrow') {
      currentShape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: state.color,
        strokeWidth: state.size,
        selectable: false,
        hoverCursor: 'default',
        objectCaching: false
      });
    } else if (state.tool === 'rectangle') {
      currentShape = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        stroke: state.color,
        strokeWidth: state.size,
        fill: 'transparent',
        selectable: false,
        hoverCursor: 'default',
        objectCaching: false
      });
    } else if (state.tool === 'circle') {
      currentShape = new fabric.Ellipse({
        left: pointer.x,
        top: pointer.y,
        rx: 0,
        ry: 0,
        stroke: state.color,
        strokeWidth: state.size,
        fill: 'transparent',
        selectable: false,
        hoverCursor: 'default',
        objectCaching: false
      });
    }

    if (currentShape) {
      canvas.add(currentShape);
      requestRender();
    }
  });

  canvas.on('mouse:move', function(opt) {
    if (!isDrawingShape || !currentShape || !shapeStart) return;

    const pointer = canvas.getPointer(opt.e);

    if (state.tool === 'line' || state.tool === 'arrow') {
      currentShape.set({ x2: pointer.x, y2: pointer.y });
    } else if (state.tool === 'rectangle') {
      const left = Math.min(shapeStart.x, pointer.x);
      const top = Math.min(shapeStart.y, pointer.y);
      const width = Math.abs(pointer.x - shapeStart.x);
      const height = Math.abs(pointer.y - shapeStart.y);
      currentShape.set({ left, top, width, height });
    } else if (state.tool === 'circle') {
      const rx = Math.abs(pointer.x - shapeStart.x) / 2;
      const ry = Math.abs(pointer.y - shapeStart.y) / 2;
      const cx = (shapeStart.x + pointer.x) / 2;
      const cy = (shapeStart.y + pointer.y) / 2;
      currentShape.set({ left: cx - rx, top: cy - ry, rx, ry });
    }

    requestRender();
  });

  canvas.on('mouse:up', function(opt) {
    if (!isDrawingShape) return;

    // Enable caching on the completed shape
    if (currentShape) {
      currentShape.objectCaching = true;
    }

    // For arrow, add arrowhead
    if (state.tool === 'arrow' && currentShape) {
      const x1 = currentShape.x1, y1 = currentShape.y1;
      const x2 = currentShape.x2, y2 = currentShape.y2;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(state.size * 4, 15);

      const arrowHead = new fabric.Triangle({
        left: x2,
        top: y2,
        width: headLen,
        height: headLen,
        fill: state.color,
        angle: (angle * 180 / Math.PI) + 90,
        originX: 'center',
        originY: 'center',
        selectable: false,
        hoverCursor: 'default',
        objectCaching: true
      });
      canvas.add(arrowHead);
    }

    isDrawingShape = false;
    shapeStart = null;
    currentShape = null;
    requestRender();
    saveState();
  });

  // Save state after drawing
  canvas.on('path:created', function(e) {
    // Enable caching on new paths
    if (e.path) e.path.objectCaching = true;
    requestRender();
    saveState();
  });

  canvas.on('object:modified', function() {
    saveState();
  });

  canvas.on('text:editing:exited', function(e) {
    saveState();
    // Remove empty text objects
    if (e.target && e.target.text === '') {
      canvas.remove(e.target);
      requestRender();
    }
  });

  // Double-click to edit existing text
  canvas.on('mouse:dblclick', function(opt) {
    const target = opt.target;
    if (target && target.type === 'i-text') {
      canvas.setActiveObject(target);
      target.enterEditing();
      target.selectAll();
    }
  });


  // Area selection screenshot
  let areaSelection = null;
  
  function startAreaScreenshot() {
    // Create selection overlay
    areaSelection = document.createElement('div');
    areaSelection.className = 'sd-area-selection-overlay';
    areaSelection.innerHTML = '<div class="sd-area-selection-box"></div><div class="sd-area-selection-hint">Click and drag to select area</div>';
    document.body.appendChild(areaSelection);
    
    const box = areaSelection.querySelector('.sd-area-selection-box');
    const hint = areaSelection.querySelector('.sd-area-selection-hint');
    let startX, startY, isSelecting = false;
    
    // Hide canvas and sidebar during selection
    canvas.wrapperEl.style.opacity = '0.3';
    sidebar.style.display = 'none';
    
    function onMouseDown(e) {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.left = startX + 'px';
      box.style.top = startY + 'px';
      box.style.width = '0';
      box.style.height = '0';
      box.style.display = 'block';
      hint.style.display = 'none';
    }
    
    function onMouseMove(e) {
      if (!isSelecting) return;
      const currentX = e.clientX;
      const currentY = e.clientY;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = width + 'px';
      box.style.height = height + 'px';
    }
    
    function onMouseUp(e) {
      if (!isSelecting) return;
      isSelecting = false;
      
      const rect = box.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) {
        cancelAreaSelection();
        return;
      }
      
      captureArea(rect);
    }
    
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cancelAreaSelection();
      }
    }
    
    function cancelAreaSelection() {
      cleanup();
      canvas.wrapperEl.style.opacity = '1';
      sidebar.style.display = '';
    }
    
    function cleanup() {
      areaSelection.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      areaSelection.remove();
      areaSelection = null;
    }
    
    function captureArea(rect) {
      cleanup();
      canvas.wrapperEl.style.display = 'none';
      document.documentElement.classList.add('sd-hide-scrollbar');
      
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const dpr = window.devicePixelRatio || 1;
      
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'capture-screenshot' }, (response) => {
          canvas.wrapperEl.style.display = '';
          canvas.wrapperEl.style.opacity = '1';
          sidebar.style.display = '';
          document.documentElement.classList.remove('sd-hide-scrollbar');
          
          if (response && response.dataUrl) {
            const img = new Image();
            img.onload = () => {
              // Create canvas for the selected area
              const areaCanvas = document.createElement('canvas');
              areaCanvas.width = rect.width * dpr;
              areaCanvas.height = rect.height * dpr;
              const ctx = areaCanvas.getContext('2d');
              
              // Draw the cropped region from the screenshot
              ctx.drawImage(
                img,
                rect.left * dpr, rect.top * dpr,
                rect.width * dpr, rect.height * dpr,
                0, 0,
                rect.width * dpr, rect.height * dpr
              );
              
              // Draw fabric canvas content on top (cropped to selection)
              const fabricDataUrl = canvas.toDataURL({
                left: scrollX + rect.left,
                top: scrollY + rect.top,
                width: rect.width,
                height: rect.height,
                multiplier: dpr
              });
              
              const fabricImg = new Image();
              fabricImg.onload = () => {
                ctx.drawImage(fabricImg, 0, 0);
                const link = document.createElement('a');
                link.download = `screenshot-area-${Date.now()}.png`;
                link.href = areaCanvas.toDataURL('image/png');
                link.click();
              };
              fabricImg.src = fabricDataUrl;
            };
            img.src = response.dataUrl;
          }
        });
      }, 100);
    }
    
    areaSelection.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  // Screenshot functions
  function takeScreenshot() {
    canvas.wrapperEl.style.display = 'none';
    sidebar.style.display = 'none';
    document.documentElement.classList.add('sd-hide-scrollbar');
    
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const dpr = window.devicePixelRatio || 1;

    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'capture-screenshot' }, (response) => {
        canvas.wrapperEl.style.display = '';
        sidebar.style.display = '';
        document.documentElement.classList.remove('sd-hide-scrollbar');
        
        if (response && response.dataUrl) {
          const img = new Image();
          img.onload = () => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            // Draw fabric canvas content on top
            const fabricDataUrl = canvas.toDataURL({
              left: scrollX,
              top: scrollY,
              width: window.innerWidth,
              height: window.innerHeight,
              multiplier: dpr
            });
            
            const fabricImg = new Image();
            fabricImg.onload = () => {
              ctx.drawImage(fabricImg, 0, 0);
              const link = document.createElement('a');
              link.download = `screenshot-${Date.now()}.png`;
              link.href = tempCanvas.toDataURL('image/png');
              link.click();
            };
            fabricImg.src = fabricDataUrl;
          };
          img.src = response.dataUrl;
        }
      });
    }, 100);
  }

  async function takeFullPageScreenshot() {
    canvas.wrapperEl.style.display = 'none';
    sidebar.style.display = 'none';
    document.documentElement.classList.add('sd-hide-scrollbar');
    
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fullWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const fullHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const dpr = window.devicePixelRatio || 1;
    
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = fullWidth * dpr;
    finalCanvas.height = fullHeight * dpr;
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.scale(dpr, dpr);
    
    const cols = Math.ceil(fullWidth / viewportWidth);
    const rows = Math.ceil(fullHeight / viewportHeight);
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const scrollX = col * viewportWidth;
        const scrollY = row * viewportHeight;
        
        window.scrollTo(scrollX, scrollY);
        await new Promise(r => setTimeout(r, 150));
        
        const actualScrollX = window.scrollX;
        const actualScrollY = window.scrollY;
        
        const dataUrl = await new Promise(resolve => {
          chrome.runtime.sendMessage({ action: 'capture-screenshot' }, (response) => {
            resolve(response?.dataUrl);
          });
        });
        
        if (dataUrl) {
          const img = await new Promise(resolve => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.src = dataUrl;
          });
          
          finalCtx.drawImage(img, actualScrollX, actualScrollY, img.width / dpr, img.height / dpr);
        }
      }
    }
    
    // Draw fabric canvas content
    const fabricDataUrl = canvas.toDataURL({ multiplier: dpr });
    const fabricImg = await new Promise(resolve => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.src = fabricDataUrl;
    });
    finalCtx.drawImage(fabricImg, 0, 0, canvas.width, canvas.height);
    
    window.scrollTo(originalScrollX, originalScrollY);
    
    canvas.wrapperEl.style.display = '';
    sidebar.style.display = '';
    document.documentElement.classList.remove('sd-hide-scrollbar');
    
    const link = document.createElement('a');
    link.download = `fullpage-screenshot-${Date.now()}.png`;
    link.href = finalCanvas.toDataURL('image/png');
    link.click();
  }


  // Keyboard shortcuts
  let isTextEditing = false;
  canvas.on('text:editing:entered', () => { isTextEditing = true; });
  canvas.on('text:editing:exited', () => { isTextEditing = false; });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || isTextEditing) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && state.active) {
      const key = e.key.toLowerCase();
      if (key === keybindings.pointer) setTool('pointer');
      else if (key === keybindings.pen) setTool('pen');
      else if (key === keybindings.highlighter) setTool('highlighter');
      else if (key === keybindings.eraser) setTool('eraser');
      else if (key === keybindings.text) setTool('text');
      else if (key === keybindings.move) setTool('move');
      else if (key === keybindings.line) setTool('line');
      else if (key === keybindings.arrow) setTool('arrow');
      else if (key === keybindings.rectangle) setTool('rectangle');
      else if (key === keybindings.circle) setTool('circle');
      else if (key === keybindings.undo) { e.preventDefault(); undo(); }
      else if (key === keybindings.redo) { e.preventDefault(); redo(); }
      else if (key === keybindings.screenshot) { e.preventDefault(); takeScreenshot(); }
      else if (key === keybindings.fullscreenshot) { e.preventDefault(); takeFullPageScreenshot(); }
      else if (key === keybindings.clear) { e.preventDefault(); clearCanvas(); }
      else if (key === keybindings.toggle) { e.preventDefault(); toggleCollapse(); }
    }
    // Delete selected objects
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!isTextEditing && state.tool === 'move') {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length > 0) {
          activeObjects.forEach(obj => canvas.remove(obj));
          canvas.discardActiveObject();
          canvas.renderAll();
          saveState();
        }
      }
    }
    
    // Escape to exit
    if (e.key === 'Escape') {
      toggle();
    }
  }, true);

  // Message listener
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') toggle();
    else if (msg.action === 'clear-canvas') clearCanvas();
    else if (msg.action === 'undo') undo();
  });

  // Handle scroll - extend canvas if needed (throttled)
  let scrollTimeout = null;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      const scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
      const neededHeight = scrollTop + window.innerHeight + 500;
      if (neededHeight > canvas.getHeight() && canvas.getHeight() < 15000) {
        canvas.setHeight(Math.min(neededHeight + 1000, 15000));
        requestRender();
      }
    }, 100);
  }, { passive: true });

  // Handle resize (debounced)
  let resizeTimeout = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      canvas.setWidth(document.documentElement.scrollWidth || window.innerWidth);
      requestRender();
    }, 150);
  });

  // Initialize
  window.__screenDrawToggle = toggle;
  setTimeout(() => sidebar.classList.add('sd-visible'), 50);
  saveStateImmediate(); // Save initial empty state
})();
