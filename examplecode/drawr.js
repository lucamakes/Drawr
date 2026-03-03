// ── Entry point ──
// If canvas already exists, exit. Otherwise load settings and initialize.
document.getElementById("drawr_canvas")
  ? exit()
  : chrome.storage.sync.get(
      {
        penColor: "#0066FF",
        penThickness: 5,
        highlightThickness: 22,
        eraseThickness: 30,
        textSize: 20,
      },
      function (settings) {
        init(settings);
      }
    );

// ── Cleanup ──
function exit() {
  document.getElementById("drawr_canvas").remove();
  document.getElementById("drawr_draggable").remove();
  var collapseToggle = document.getElementById("drawr_collapseToggle");
  if (collapseToggle) collapseToggle.remove();
}

// ── Hex to RGBA ──
function convertHex(hex, alpha = 0.3) {
  var stripped = hex.replace("#", "");
  if (stripped.length === 3) {
    stripped = stripped[0] + stripped[0] + stripped[1] + stripped[1] + stripped[2] + stripped[2];
  }
  var r = parseInt(stripped.substring(0, 2), 16);
  var g = parseInt(stripped.substring(2, 4), 16);
  var b = parseInt(stripped.substring(4, 6), 16);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}

// ── Main initialization ──
function init(settings) {
  // ── Tool state flags ──
  var isTextEditing = false;
  var isHighlighterActive = false;
  var isEraserActive = false;
  var isPointerActive = false;
  var isTextToolActive = false;
  var isLineToolActive = false;
  var isMoveActive = false;
  var isDrawingLine = false;
  var isMouseDown = false;

  // ── Thickness values (mutable per tool) ──
  var penThickness = settings.penThickness;
  var highlightThickness = settings.highlightThickness;
  var eraseThickness = settings.eraseThickness;
  var textSize = settings.textSize;

  // ── Undo / redo stacks ──
  var currentState;
  var undoStack = [];
  var redoStack = [];

  // ── Pressed keys tracker ──
  var pressedKeys = {};

  // ── Helper: clear active tool highlight ──
  function clearActiveTool(toolEl) {
    toolEl.classList.remove("drawr_activeTool");
  }

  // ── Helper: select a tool ──
  function selectTool(toolEl) {
    canvas.discardActiveObject().renderAll();
    canvas.wrapperEl.style.cursor = "crosshair";
    canvas.wrapperEl.style.pointerEvents = "auto";
    canvas.selection = true;
    canvas.isDrawingMode = true;
    isMoveActive = isLineToolActive = isHighlighterActive = isEraserActive = isPointerActive = isTextToolActive = false;
    allToolEls.forEach(clearActiveTool);
    toolEl.classList.add("drawr_activeTool");
  }

  // ── Helper: enable/disable undo/redo button ──
  function setButtonEnabled(el, enabled) {
    if (enabled) {
      el.style.opacity = 1;
      el.style.cursor = "pointer";
    } else {
      el.style.opacity = 0.3;
      el.style.cursor = "not-allowed";
    }
  }

  // ── Helper: save canvas state for undo ──
  function saveState() {
    redoStack = [];
    setButtonEnabled(redoBtn, false);
    if (currentState !== null) {
      undoStack.push(currentState);
      setButtonEnabled(undoBtn, true);
    }
    currentState = JSON.stringify(canvas);
  }

  // ── Helper: restore state (shared by undo/redo) ──
  function restoreState(fromStack, toStack, fromBtn, toBtn) {
    if (fromStack.length === 0) return;
    toStack.push(currentState);
    currentState = fromStack.pop();
    canvas.clear();
    canvas.loadFromJSON(currentState);
    canvas.renderAll();
    setButtonEnabled(fromBtn, true);
    setButtonEnabled(toBtn, fromStack.length > 0);
  }

  // ── Helper: lock all objects (for line tool) ──
  function lockAllObjects() {
    canvas.getObjects().forEach(function (obj) {
      obj.selectable = false;
      obj.hoverCursor = "normal";
    });
  }

  // ══════════════════════════════════════
  //  Tool actions
  // ══════════════════════════════════════

  function activatePen() {
    selectTool(penEl);
    canvas.freeDrawingBrush = defaultBrush;
    canvas.freeDrawingBrush.color = colorPicker.value;
    thicknessSlider.value = penThickness;
    canvas.freeDrawingBrush.width = parseInt(thicknessSlider.value) || 5;
  }

  function activateHighlighter() {
    selectTool(highlighterEl);
    isHighlighterActive = true;
    canvas.freeDrawingBrush = defaultBrush;
    canvas.freeDrawingBrush.color = convertHex(colorPicker.value);
    thicknessSlider.value = highlightThickness;
    canvas.freeDrawingBrush.width = parseInt(thicknessSlider.value) || 5;
  }

  function activateEraser() {
    selectTool(eraserEl);
    isEraserActive = true;
    canvas.freeDrawingBrush = eraserBrush;
    thicknessSlider.value = eraseThickness;
    canvas.freeDrawingBrush.width = parseInt(thicknessSlider.value) || 5;
  }

  function activatePointer() {
    selectTool(pointerEl);
    isPointerActive = true;
    canvas.isDrawingMode = false;
    canvas.wrapperEl.style.pointerEvents = "none";
  }

  function activateMove() {
    selectTool(moveEl);
    canvas.isDrawingMode = false;
    isMoveActive = true;
    canvas.getObjects().forEach(function (obj) {
      obj.selectable = true;
      obj.hoverCursor = "move";
    });
  }

  function activateText() {
    selectTool(textEl);
    isTextToolActive = true;
    canvas.isDrawingMode = false;
    thicknessSlider.value = textSize;
  }

  function activateLine() {
    selectTool(lineEl);
    isLineToolActive = true;
    thicknessSlider.value = penThickness;
    canvas.isDrawingMode = false;
    canvas.selection = false;
    lockAllObjects();
  }

  function clearCanvas() {
    canvas.clear();
    saveState();
  }

  function undo() {
    restoreState(undoStack, redoStack, redoBtn, undoBtn);
  }

  function redo() {
    restoreState(redoStack, undoStack, undoBtn, redoBtn);
    if (isLineToolActive) lockAllObjects();
  }

  // ── Screenshot ──
  function takeScreenshot() {
    var toolbar = document.getElementById("drawr_draggable");
    new Promise(function (resolve, reject) {
      toolbar.style.display = "none";
      setTimeout(function () {
        toolbar.style.display === "none" ? resolve() : reject();
      }, 500);
    })
      .then(function () {
        chrome.runtime.sendMessage({ from: "content_script" }, function (response) {
          var screenshot = response.screenshot;
          var date = new Date();
          var dateStr =
            date.getFullYear() +
            "-" +
            ("0" + (date.getMonth() + 1)).slice(-2) +
            "-" +
            ("0" + date.getDate()).slice(-2);

          var link = document.createElement("a");
          link.download = "Screenshot_" + dateStr + ".png";
          link.href = screenshot;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          toolbar.style.display = "block";
        });
      })
      .catch(function () {
        console.error("An error has occured.");
      });
  }

  // ══════════════════════════════════════
  //  Canvas setup
  // ══════════════════════════════════════

  var bodyEl = document.body;
  var docEl = document.documentElement;
  var scrollTop = bodyEl.scrollTop || docEl.scrollTop;
  var pageHeight = Math.max(
    bodyEl.scrollHeight, bodyEl.offsetHeight,
    docEl.clientHeight, docEl.scrollHeight, docEl.offsetHeight
  );

  // Start canvas just big enough for the current viewport + buffer
  var canvasHeight = scrollTop + window.innerHeight + 500;
  if (canvasHeight > pageHeight) canvasHeight = pageHeight;
  if (canvasHeight > 25000) {
    alert("This extension does not support pages with this height. Please try again on a different website.");
    exit();
  }

  var canvas = (this.__canvas = new fabric.Canvas("c", { isDrawingMode: true }));
  fabric.Object.prototype.transparentCorners = true;
  canvas.setDimensions({ width: document.body.clientWidth, height: canvasHeight });
  canvas.wrapperEl.id = "drawr_canvas";
  document.body.appendChild(canvas.wrapperEl);

  // ══════════════════════════════════════
  //  Toolbar DOM
  // ══════════════════════════════════════

  var toolbar = document.createElement("div");
  toolbar.id = "drawr_draggable";
  document.body.appendChild(toolbar);
  toolbar.innerHTML =
    '<div id="drawr_color">' +
      '<div class="drawr_title">Color</div>' +
      '<input id="drawr_colorSelect" type="color" value="#0066FF">' +
    '</div>' +
    '<div id="drawr_tools">' +
      '<div class="drawr_title drawr_toolsTitle">Tools</div>' +
      '<div class="drawr_toolDiv">' +
        '<a id="drawr_pen" class="drawr_tool"><img id="drawr_penImg" class="drawr_icon" alt="Marker" title="Marker"></a>' +
        '<a id="drawr_highlighter" class="drawr_tool"><img id="drawr_highlighterImg" class="drawr_icon" alt="Highlighter" title="Highlighter"></a>' +
        '<a id="drawr_eraser" class="drawr_tool"><img id="drawr_eraserImg" class="drawr_icon" alt="Eraser" title="Eraser"></a>' +
        '<a id="drawr_pointer" class="drawr_tool"><img id="drawr_pointerImg" class="drawr_icon" alt="Pointer" title="Pointer"></a>' +
        '<a id="drawr_text" class="drawr_tool"><img id="drawr_textImg" class="drawr_icon" alt="Text" title="Text"></a>' +
        '<a id="drawr_move" class="drawr_tool"><img id="drawr_moveImg" class="drawr_icon" alt="Move" title="Move"></a>' +
        '<a id="drawr_line" class="drawr_tool"><img id="drawr_lineImg" class="drawr_icon" alt="Line" title="Line"></a>' +
        '<a id="drawr_save" class="drawr_tool"><img id="drawr_saveImg" class="drawr_icon" alt="Save" title="Save Drawing"></a>' +
        '<a id="drawr_undo" class="drawr_tool"><img id="drawr_undoImg" class="drawr_icon" alt="Undo" title="Undo"></a>' +
        '<a id="drawr_redo" class="drawr_tool"><img id="drawr_redoImg" class="drawr_icon" alt="Redo" title="Redo"></a>' +
        '<a id="drawr_clear" class="drawr_tool"><img id="drawr_clearImg" class="drawr_icon" alt="Clear" title="Clear"></a>' +
        '<a id="drawr_settings" class="drawr_tool"><img id="drawr_settingsImg" class="drawr_icon" alt="Settings" title="Settings"></a>' +
      '</div>' +
    '</div>' +
    '<div id="drawr_size">' +
      '<div class="drawr_title">Size</div>' +
      '<input type="range" id="drawr_thicknessSlider" value="5" max="60" min="1">' +
    '</div>';

  // ── Collapse / expand toggle ──
  var collapseBtn = document.createElement("button");
  collapseBtn.id = "drawr_collapseToggle";
  var chevronUrl = chrome.runtime.getURL("icons/chevron_right.svg");
  collapseBtn.innerHTML =
    '<img src="' + chevronUrl + '" style="width:14px;height:14px;filter:invert(1) brightness(0.7);transition:transform 0.3s ease;pointer-events:none;">';
  collapseBtn.title = "Collapse toolbar";
  collapseBtn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    toolbar.classList.toggle("drawr_collapsed");
    collapseBtn.classList.toggle("drawr_collapsed");
    var img = collapseBtn.querySelector("img");
    if (toolbar.classList.contains("drawr_collapsed")) {
      img.style.transform = "rotate(180deg)";
      collapseBtn.title = "Expand toolbar";
    } else {
      img.style.transform = "rotate(0deg)";
      collapseBtn.title = "Collapse toolbar";
    }
  });
  document.body.appendChild(collapseBtn);

  // ── Donate button ──
  var donateDiv = document.createElement("div");
  donateDiv.id = "drawr_donateContainer";
  donateDiv.innerHTML =
    '<a title="Donate" id="drawr_donate" class="drawr_donateLink" ' +
    'href="https://ko-fi.com/lucamakes" target="_blank">' +
    '<img src="' + chrome.runtime.getURL("icons/kofi_symbol.svg") + '" class="drawr_kofiSvg" alt="Ko-fi">' +
    '<span class="drawr_donateLabel">Donate</span></a>';
  toolbar.appendChild(donateDiv);

  // ══════════════════════════════════════
  //  Wire up tool buttons
  // ══════════════════════════════════════

  var allToolEls = document.querySelectorAll(".drawr_tool");
  var toolActions = [
    activatePen, activateHighlighter, activateEraser, activatePointer,
    activateText, activateMove, activateLine, takeScreenshot,
    undo, redo, clearCanvas, openSettings,
  ];
  var iconMap = [
    "edit.svg", "ink_highlighter.svg", "ink_eraser.svg", "arrow_selector_tool.svg",
    "title.svg", "open_with.svg", "horizontal_rule.svg", "photo_camera.svg",
    "undo.svg", "redo.svg", "delete.svg", "settings.svg",
  ];
  allToolEls.forEach(function (el, i) {
    var img = el.querySelector("img");
    img.src = chrome.runtime.getURL("icons/" + iconMap[i]);
    el.onclick = toolActions[i];
  });

  // ── Element references ──
  var colorPicker = document.getElementById("drawr_colorSelect");
  var penEl = document.getElementById("drawr_pen");
  var pointerEl = document.getElementById("drawr_pointer");
  var moveEl = document.getElementById("drawr_move");
  var textEl = document.getElementById("drawr_text");
  var lineEl = document.getElementById("drawr_line");
  var eraserEl = document.getElementById("drawr_eraser");
  var highlighterEl = document.getElementById("drawr_highlighter");
  var thicknessSlider = document.getElementById("drawr_thicknessSlider");
  var undoBtn = document.getElementById("drawr_undo");
  var redoBtn = document.getElementById("drawr_redo");

  // ── Set initial tool state ──
  penEl.classList.add("drawr_activeTool");
  thicknessSlider.value = penThickness;
  colorPicker.value = settings.penColor;

  // ── Brushes ──
  var eraserBrush = new fabric.EraserBrush(canvas);
  var defaultBrush = canvas.freeDrawingBrush;
  defaultBrush.color = colorPicker.value;
  defaultBrush.width = parseInt(thicknessSlider.value) || 5;

  // ── Slider input ──
  thicknessSlider.addEventListener("input", function () {
    if (isEraserActive) eraseThickness = thicknessSlider.value;
    else if (isHighlighterActive) highlightThickness = thicknessSlider.value;
    else penThickness = thicknessSlider.value;
    canvas.freeDrawingBrush.width = parseInt(thicknessSlider.value) || 5;
  }, false);

  // ── Color input ──
  colorPicker.addEventListener("input", function () {
    var color = this.value;
    if (isHighlighterActive) color = convertHex(color);
    canvas.freeDrawingBrush.color = color;
  }, false);

  // ── Undo/redo initial state ──
  setButtonEnabled(undoBtn, false);
  setButtonEnabled(redoBtn, false);

  // ══════════════════════════════════════
  //  Canvas events
  // ══════════════════════════════════════

  canvas.getContext("2d");

  canvas.on("text:editing:entered", function () {
    isTextEditing = true;
  });

  canvas.on("text:editing:exited", function () {
    isTextEditing = false;
    isTextToolActive = false;
    activateMove();
  });

  canvas.on("mouse:down", function (opt) {
    isMouseDown = true;

    // Text tool: place a new text object
    if (isTextToolActive && !isTextEditing) {
      var evt = opt.e;
      var fontSize = 2 * parseInt(thicknessSlider.value);
      var x, y;
      if (evt.type === "touchstart") {
        var rect = evt.target.getBoundingClientRect();
        x = evt.targetTouches[0].pageX - rect.left;
        y = evt.targetTouches[0].pageY - rect.top;
      } else {
        x = evt.offsetX;
        y = evt.offsetY;
      }
      var textObj = new fabric.IText("", {
        fontFamily: "arial",
        fontSize: fontSize,
        fill: colorPicker.value,
        left: x,
        top: y - fontSize / 2,
      });
      canvas.add(textObj).setActiveObject(textObj);
      textObj.enterEditing();
    }
    // Line tool: start drawing a line
    else if (isLineToolActive) {
      isDrawingLine = true;
      var pointer = canvas.getPointer(opt.e);
      var lineObj = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        strokeWidth: parseInt(thicknessSlider.value),
        fill: colorPicker.value,
        stroke: colorPicker.value,
        originX: "center",
        originY: "center",
        selectable: false,
        hoverCursor: "normal",
        targetFindTolerance: true,
      });
      canvas.add(lineObj);
      // Store reference for mouse:move
      this._currentLine = lineObj;
    }
  });

  canvas.on("mouse:move", function (opt) {
    if (isLineToolActive && isDrawingLine && this._currentLine) {
      var pointer = canvas.getPointer(opt.e);
      this._currentLine.set({ x2: pointer.x, y2: pointer.y });
      canvas.renderAll();
    }
  });

  canvas.on("object:modified", function () {
    saveState();
  });

  canvas.on("mouse:up", function () {
    isMouseDown = false;
    if (!isMoveActive && !isTextToolActive) {
      saveState();
      if (isLineToolActive) {
        isDrawingLine = false;
        if (this._currentLine) {
          this._currentLine.setCoords();
          this._currentLine = null;
        }
      }
    }
  });

  // ══════════════════════════════════════
  //  Scroll handler (throttled via rAF)
  // ══════════════════════════════════════

  var scrollTicking = false;
  window.onscroll = function () {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      scrollTop = bodyEl.scrollTop || docEl.scrollTop;
      if (scrollTop + window.innerHeight + 500 > canvas.getHeight()) {
        var maxH = Math.max(
          bodyEl.scrollHeight, bodyEl.offsetHeight,
          docEl.clientHeight, docEl.scrollHeight, docEl.offsetHeight
        );
        var newH = Math.min(maxH, scrollTop + window.innerHeight + 2000);
        if (newH > canvas.getHeight()) canvas.setHeight(newH);
      }
      if (canvas.getHeight() > 25000) {
        alert("This extension does not support pages with this height. Please try again on a different website.");
        exit();
      }
      scrollTicking = false;
    });
  };

  // ══════════════════════════════════════
  //  Keybindings
  // ══════════════════════════════════════

  var defaultBindings = {
    pen: "KeyD", highlighter: "KeyH", eraser: "KeyE",
    pointer: "KeyP", text: "KeyT", move: "KeyM",
    line: "KeyL", undo: "KeyZ", redo: "KeyR", clear: "KeyX",
  };
  var keyBindings = {};
  var keyDisplayMap = {};

  function codeToDisplay(code) {
    if (keyDisplayMap[code]) return keyDisplayMap[code];
    return code.replace("Key", "").replace("Digit", "");
  }

  // Detect keyboard layout
  function buildKeyDisplayMap() {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap()
        .then(function (layoutMap) {
          layoutMap.forEach(function (val, key) {
            keyDisplayMap[key] = val.toUpperCase();
          });
        })
        .catch(function () {});
    }
    document.addEventListener("keydown", function detectLayout(ev) {
      if (ev.code.startsWith("Key") && ev.key.length === 1) {
        keyDisplayMap[ev.code] = ev.key.toUpperCase();
      }
    }, { capture: true });
  }
  buildKeyDisplayMap();

  // Load saved keybindings
  chrome.storage.sync.get({ keyBindings: defaultBindings }, function (stored) {
    keyBindings = stored.keyBindings;
  });

  // Build runtime key → action map
  function getKeyMap() {
    var km = {};
    km[keyBindings.undo || "KeyZ"] = undo;
    km[keyBindings.redo || "KeyR"] = redo;
    km[keyBindings.pen || "KeyD"] = activatePen;
    km[keyBindings.highlighter || "KeyH"] = activateHighlighter;
    km[keyBindings.move || "KeyM"] = activateMove;
    km[keyBindings.text || "KeyT"] = activateText;
    km[keyBindings.pointer || "KeyP"] = activatePointer;
    km[keyBindings.line || "KeyL"] = activateLine;
    km[keyBindings.eraser || "KeyE"] = activateEraser;
    km[keyBindings.clear || "KeyX"] = clearCanvas;
    return km;
  }

  // ══════════════════════════════════════
  //  Settings modal
  // ══════════════════════════════════════

  function openSettings() {
    var overlay = document.getElementById("drawr_settingsOverlay");
    if (overlay) { overlay.remove(); return; }

    overlay = document.createElement("div");
    overlay.id = "drawr_settingsOverlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;" +
      "background:rgba(0,0,0,0.5);z-index:2147483647;" +
      "display:flex;align-items:center;justify-content:center;";

    var modal = document.createElement("div");
    modal.id = "drawr_settingsModal";
    modal.style.cssText =
      "background:rgba(24,24,27,0.96);backdrop-filter:blur(20px);" +
      "border:1px solid rgba(255,255,255,0.1);border-radius:16px;" +
      "padding:24px 28px;min-width:320px;max-width:400px;" +
      "color:rgba(255,255,255,0.85);" +
      "font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;" +
      "box-shadow:0 20px 60px rgba(0,0,0,0.5);";

    // Title
    var title = document.createElement("div");
    title.textContent = "Keybindings";
    title.style.cssText = "font-size:16px;font-weight:700;margin-bottom:16px;color:#fff;letter-spacing:-0.2px;";
    modal.appendChild(title);

    // Layout detection hint
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap()
        .then(function (lm) {
          var sample = lm.get("KeyQ") || "";
          var layouts = { q: "QWERTY", a: "AZERTY", "'": "Dvorak" };
          var layoutName = layouts[sample] || "";
          if (layoutName) {
            hint.textContent = "Detected layout: " + layoutName + ". All shortcuts use Shift + key. Click a field and press a key to rebind.";
          }
        })
        .catch(function () {});
    }

    var hint = document.createElement("div");
    hint.textContent = "All shortcuts use Shift + key. Click a field and press a key to rebind.";
    hint.style.cssText = "font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:16px;line-height:1.4;";
    modal.appendChild(hint);

    // Keybinding rows
    var toolNames = ["pen", "highlighter", "eraser", "pointer", "text", "move", "line", "undo", "redo", "clear"];
    var labels = ["Marker", "Highlighter", "Eraser", "Pointer", "Text", "Move", "Line", "Undo", "Redo", "Clear"];
    var inputs = {};

    toolNames.forEach(function (name, i) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";

      var lbl = document.createElement("span");
      lbl.textContent = labels[i];
      lbl.style.cssText = "font-size:13px;font-weight:500;color:rgba(255,255,255,0.7);";

      var inp = document.createElement("input");
      inp.type = "text";
      inp.readOnly = true;
      inp.dataset.tool = name;
      inp.value = codeToDisplay(keyBindings[name] || defaultBindings[name]);
      inp.style.cssText =
        "width:50px;text-align:center;background:rgba(255,255,255,0.08);" +
        "border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#fff;" +
        "font-size:13px;font-weight:600;padding:6px 0;outline:none;cursor:pointer;font-family:inherit;";

      inp.addEventListener("focus", function () {
        inp.style.borderColor = "rgba(255,255,255,0.4)";
        inp.value = "...";
      });
      inp.addEventListener("blur", function () {
        inp.style.borderColor = "rgba(255,255,255,0.12)";
        inp.value = codeToDisplay(keyBindings[inp.dataset.tool] || defaultBindings[inp.dataset.tool]);
      });
      inp.addEventListener("keydown", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.code.startsWith("Key")) {
          keyBindings[inp.dataset.tool] = ev.code;
          if (ev.key.length === 1) keyDisplayMap[ev.code] = ev.key.toUpperCase();
          inp.value = codeToDisplay(ev.code);
          inp.blur();
        }
      });

      inputs[name] = inp;
      row.appendChild(lbl);
      row.appendChild(inp);
      modal.appendChild(row);
    });

    // Save / Cancel buttons
    var btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;margin-top:18px;";

    var saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.style.cssText =
      "flex:1;padding:8px 0;border:none;border-radius:8px;" +
      "background:rgba(255,255,255,0.12);color:#fff;font-size:13px;" +
      "font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.15s;";
    saveBtn.addEventListener("mouseenter", function () { saveBtn.style.background = "rgba(255,255,255,0.2)"; });
    saveBtn.addEventListener("mouseleave", function () { saveBtn.style.background = "rgba(255,255,255,0.12)"; });
    saveBtn.addEventListener("click", function () {
      chrome.storage.sync.set({ keyBindings: keyBindings });
      overlay.remove();
    });

    var cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText =
      "flex:1;padding:8px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;" +
      "background:transparent;color:rgba(255,255,255,0.6);font-size:13px;" +
      "font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.15s;";
    cancelBtn.addEventListener("mouseenter", function () { cancelBtn.style.background = "rgba(255,255,255,0.06)"; });
    cancelBtn.addEventListener("mouseleave", function () { cancelBtn.style.background = "transparent"; });
    cancelBtn.addEventListener("click", function () {
      chrome.storage.sync.get({ keyBindings: defaultBindings }, function (s) { keyBindings = s.keyBindings; });
      overlay.remove();
    });

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);

    // Click outside to close
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) {
        chrome.storage.sync.get({ keyBindings: defaultBindings }, function (s) { keyBindings = s.keyBindings; });
        overlay.remove();
      }
    });

    document.body.appendChild(overlay);
  }

  // ══════════════════════════════════════
  //  Keyboard shortcuts
  // ══════════════════════════════════════

  document.addEventListener("keydown", function (e) {
    pressedKeys[e.code] = true;

    // Delete selected objects with Backspace
    if (e.code === "Backspace" && !isTextToolActive && !isTextEditing) {
      var activeObjects = canvas.getActiveObjects();
      for (var i = 0; i < activeObjects.length; i++) {
        canvas.remove(activeObjects[i]);
      }
      canvas.discardActiveObject().renderAll();
      saveState();
    }

    // Exit on Escape
    if (e.code === "Escape") exit();

    // Shift + key shortcuts
    var keyMap = getKeyMap();
    if (!isTextEditing && !isTextToolActive && !isMouseDown && pressedKeys.ShiftLeft && keyMap[e.code]) {
      var clearKey = keyBindings.clear || "KeyX";
      if (e.code === clearKey && isPointerActive) {
        // Don't clear when pointer is active
      } else {
        keyMap[e.code]();
      }
    }
  });

  document.addEventListener("keyup", function (e) {
    pressedKeys[e.code] = false;
  });
}
