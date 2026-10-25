/* Passages split at verse boundaries — the operator's explicit « Découper ».
 * Pure string functions (no DOM): the conductor, the output and the tests use
 * the same rules. A range's markup carries one marker per verse,
 * <sup class="verse-num">N</sup>, produced by the Bible loader and kept by the
 * HTML allowlist; a part is a contiguous run of whole verses. */
(function () {
  "use strict";
  var V = (window.VerseObs = window.VerseObs || {});
  var MARK = /<sup class="verse-num">(\d+)<\/sup>/g;

  /** [{ num, html }] in reading order, or [] when there is nothing to split. */
  function verses(html) {
    html = String(html || "");
    var list = [],
      match,
      last = null;
    MARK.lastIndex = 0;
    while ((match = MARK.exec(html))) {
      if (last) last.html = html.slice(last.start, match.index).trim();
      last = { num: Number(match[1]), start: list.length ? match.index : 0 };
      list.push(last);
    }
    if (!last) return [];
    last.html = html.slice(last.start).trim();
    return list.map(function (v) {
      return { num: v.num, html: v.html };
    });
  }

  function decode(text) {
    return text
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }
  /** Plain reading text of a markup run, verse numbers excluded. */
  function plain(html) {
    return decode(
      String(html || "")
        .replace(MARK, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, ""),
    )
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  }

  /** « Psaumes 119:1-48 » → « Psaumes 119:9-16 » (or « …:9 » for one verse). */
  function range(reference, first, last) {
    var nums = first === last ? String(first) : first + "-" + last;
    var ref = String(reference || "");
    return /:\d+(?:-\d+)?$/.test(ref)
      ? ref.replace(/:\d+(?:-\d+)?$/, ":" + nums)
      : ref + ":" + nums;
  }

  function pick(list, a, b) {
    return list.filter(function (v) {
      return v.num >= a && v.num <= b;
    });
  }
  function join(list) {
    return list
      .map(function (v) {
        return v.html;
      })
      .join(" ");
  }

  /**
   * One conductor item per range [first, last]. Part 1 keeps the item's
   * identifier (the output may be showing it); the others get new ones from
   * the conductor. Returns [] when the passage cannot be split (no verse
   * markers, or a second translation edited by hand without them).
   */
  function split(item, ranges, group) {
    var primary = verses(item.html),
      second = item.secondary ? verses(item.secondary.html) : null;
    if (primary.length < 2 || !ranges || ranges.length < 2) return [];
    if (item.secondary && second.length < 2) return [];
    var whole = item.whole || item.reference || "";
    return ranges.map(function (r, i) {
      var own = pick(primary, r[0], r[1]);
      var part = {
        type: "verse",
        html: join(own),
        text: plain(join(own)),
        reference: range(whole, r[0], r[1]),
        version: item.version || "",
        group: group,
        part: i + 1,
        parts: ranges.length,
        whole: whole,
      };
      if (i === 0 && item.id) part.id = item.id;
      if (item.secondary) {
        var theirs = pick(second, r[0], r[1]);
        part.secondary = {
          text: plain(join(theirs)),
          html: join(theirs),
          reference: range(item.secondary.reference, r[0], r[1]),
          version: item.secondary.version || "",
          lang: item.secondary.lang || "",
        };
      }
      return part;
    });
  }

  /** The whole passage again, from its parts (in reading order). */
  function merge(parts) {
    var first = parts[0],
      lastPart = parts[parts.length - 1];
    var firstNum = (verses(first.html)[0] || {}).num,
      tail = verses(lastPart.html),
      lastNum = (tail[tail.length - 1] || {}).num;
    var item = {
      type: "verse",
      html: parts
        .map(function (p) {
          return p.html;
        })
        .join(" "),
      text: parts
        .map(function (p) {
          return p.text;
        })
        .join(" "),
      reference: first.whole || range(first.reference, firstNum, lastNum),
      version: first.version || "",
    };
    if (first.id) item.id = first.id;
    if (first.secondary) {
      item.secondary = {
        text: parts
          .map(function (p) {
            return p.secondary ? p.secondary.text : "";
          })
          .join(" "),
        html: parts
          .map(function (p) {
            return p.secondary ? p.secondary.html : "";
          })
          .join(" "),
        reference: range(first.secondary.reference, firstNum, lastNum),
        version: first.secondary.version || "",
        lang: first.secondary.lang || "",
      };
    }
    return item;
  }

  V.Passage = {
    verses: verses,
    plain: plain,
    range: range,
    split: split,
    merge: merge,
  };
})();
