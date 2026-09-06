/* The same small, inert rich-text allowlist is used in editors and outputs. */
(function () {
  "use strict";
  var allowed = {
    B: 1,
    I: 1,
    U: 1,
    STRONG: 1,
    EM: 1,
    MARK: 1,
    SPAN: 1,
    BR: 1,
    SUP: 1,
  };
  function sanitizeHtml(html) {
    var template = document.createElement("template");
    template.innerHTML = String(html || "");
    function clean(node) {
      Array.from(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1) {
          child.remove();
          return;
        }
        if (
          [
            "SCRIPT",
            "STYLE",
            "IFRAME",
            "OBJECT",
            "IMG",
            "SVG",
            "MATH",
          ].includes(child.nodeName)
        ) {
          child.remove();
          return;
        }
        var block = child.nodeName === "DIV" || child.nodeName === "P";
        if (!allowed[child.nodeName] && !block) {
          node.replaceChild(
            document.createTextNode(child.textContent || ""),
            child,
          );
          return;
        }
        var bg = child.style.backgroundColor,
          number = child.className === "verse-num";
        while (child.attributes.length)
          child.removeAttribute(child.attributes[0].name);
        if (bg) child.style.backgroundColor = bg;
        if (number) child.className = "verse-num";
        clean(child);
        if (block) {
          if (child.previousSibling && child.previousSibling.nodeName !== "BR")
            node.insertBefore(document.createElement("br"), child);
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          if (child.nextSibling)
            node.insertBefore(document.createElement("br"), child);
          child.remove();
        }
      });
    }
    clean(template.content);
    return template.innerHTML;
  }
  window.VerseObs = window.VerseObs || {};
  window.VerseObs.sanitizeHtml = sanitizeHtml;
})();
