// Discourages opening DevTools: blocks the usual shortcuts and the page's right-click menu, and
// covers the page while DevTools is open. Only a deterrent — it never clears data or reloads.
// Open the page as index.html?dev to turn it off while developing.

(function () {
  if (/[?&]dev\b/.test(location.search)) return;

  // F12, Ctrl+Shift+I/J/C, Ctrl+U (view source); Cmd+Opt+I/J/C/U on Mac
  document.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toUpperCase();
      const mod = e.ctrlKey || e.metaKey;
      if (
        k === "F12" ||
        (mod && (e.shiftKey || e.altKey) && "IJC".includes(k)) ||
        (mod && k === "U")
      )
        e.preventDefault();
    },
    true,
  );

  // right-click stays available in text fields so copy / paste still work
  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest("input, textarea, [contenteditable]"))
      e.preventDefault();
  });

  const cover = document.createElement("div");
  cover.id = "guard";
  cover.textContent = "Vui lòng đóng DevTools để tiếp tục sử dụng.";
  cover.hidden = true;
  document.body.appendChild(cover);

  // `debugger` only pauses when DevTools is open, so a slow pass means it is open
  const check = () => {
    const t = performance.now();
    debugger;
    cover.hidden = performance.now() - t < 100;
    setTimeout(check, 1000);
  };
  check();
})();
