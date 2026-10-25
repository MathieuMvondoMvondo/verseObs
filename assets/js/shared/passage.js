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

  /** [first, last] verse numbers named by a reference (« …:5-8 »), or null. */
  function span(reference) {
    var m = /:(\d+)(?:-(\d+))?$/.exec(String(reference || ""));
    return m ? [Number(m[1]), Number(m[2] || m[1])] : null;
  }
  /** « 119:5-8 » : the numbers of a range of the passage, for messages. */
  function numbers(reference, first, last) {
    var ref = range(reference, first, last);
    return ref.slice(ref.lastIndexOf(" ") + 1);
  }
  /** The plans with their verse numbers, in reading order. */
  function ordered(parts) {
    return parts
      .map(function (p, i) {
        return {
          plan: p,
          nums: verses(p.html).map(function (v) {
            return v.num;
          }),
          i: i,
        };
      })
      .sort(function (a, b) {
        return (a.nums[0] || 0) - (b.nums[0] || 0) || a.i - b.i;
      });
  }

  /**
   * Can these plans of one group become one passage again? Every plan 1..N
   * of the group must be there and no verse may appear twice; otherwise the
   * reason, for the operator (« Il manque le plan 2/12 (119:5-8). »).
   * Returns "" when they can. Plans moved by hand are fine (reading order
   * comes from the verse numbers).
   */
  function incomplete(parts) {
    if (!parts || !parts.length) return "Aucun plan à regrouper.";
    var list = ordered(parts),
      whole = parts[0].whole || parts[0].reference,
      seen = {},
      i,
      j;
    for (i = 0; i < list.length; i++) {
      if (!list[i].nums.length)
        return "Un plan n’a plus ses numéros de verset : regroupement impossible.";
      for (j = 0; j < list[i].nums.length; j++) {
        var n = list[i].nums[j];
        if (seen[n])
          return "Le verset " + numbers(whole, n, n) + " figure dans deux plans.";
        seen[n] = true;
      }
    }
    var total = 0,
      byPart = {};
    list.forEach(function (x) {
      if (Number.isInteger(x.plan.parts)) total = Math.max(total, x.plan.parts);
      if (Number.isInteger(x.plan.part)) byPart[x.plan.part] = x;
    });
    total = Math.max(total, list.length);
    var holes = [],
      run = null;
    for (i = 1; i <= total; i++) {
      if (byPart[i]) run = null;
      else if (run) run[1] = i;
      else holes.push((run = [i, i]));
    }
    if (!holes.length) return "";
    var bounds = span(whole);
    var near = function (from, step) {
      for (var k = from; k >= 1 && k <= total; k += step)
        if (byPart[k]) return byPart[k].nums;
      return null;
    };
    var says = holes.map(function (h) {
      var before = near(h[0] - 1, -1),
        after = near(h[1] + 1, 1),
        lo = before ? before[before.length - 1] + 1 : bounds && bounds[0],
        hi = after ? after[0] - 1 : bounds && bounds[1],
        where = lo && hi && lo <= hi ? " (" + numbers(whole, lo, hi) + ")" : "";
      if (h[0] === h[1]) return "le plan " + h[0] + "/" + total + where;
      return (
        "les plans " +
        h[0] +
        (h[1] === h[0] + 1 ? " et " : " à ") +
        h[1] +
        "/" +
        total +
        where
      );
    });
    return (
      "Il manque " +
      (says.length > 1
        ? says.slice(0, -1).join(", ") + " et " + says[says.length - 1]
        : says[0]) +
      "."
    );
  }

  /**
   * The whole passage again, from its plans in reading order, named after
   * the verses actually present. Throws (with the reason) rather than
   * inventing a passage when a plan is missing.
   */
  function merge(parts) {
    var problem = incomplete(parts);
    if (problem) throw new Error(problem);
    var list = ordered(parts),
      sorted = list.map(function (x) {
        return x.plan;
      }),
      first = sorted[0],
      firstNum = list[0].nums[0],
      tail = list[list.length - 1].nums,
      lastNum = tail[tail.length - 1];
    var item = {
      type: "verse",
      html: sorted
        .map(function (p) {
          return p.html;
        })
        .join(" "),
      text: sorted
        .map(function (p) {
          return p.text;
        })
        .join(" "),
      reference: range(first.whole || first.reference, firstNum, lastNum),
      version: first.version || "",
    };
    if (first.id) item.id = first.id;
    if (first.secondary) {
      item.secondary = {
        text: sorted
          .map(function (p) {
            return p.secondary ? p.secondary.text : "";
          })
          .join(" "),
        html: sorted
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

  /**
   * After a plan was split again inside its group (a larger style), number
   * the plans of that group in reading order: plan n/N. Other items and the
   * conductor order are left as they are. Returns a new list.
   */
  function renumber(items, group) {
    var members = ordered(
      items.filter(function (item) {
        return item.group === group;
      }),
    ).map(function (x) {
      return x.plan;
    });
    return items.map(function (item) {
      var rank = members.indexOf(item);
      return rank === -1
        ? item
        : Object.assign({}, item, { part: rank + 1, parts: members.length });
    });
  }

  V.Passage = {
    verses: verses,
    plain: plain,
    range: range,
    split: split,
    merge: merge,
    incomplete: incomplete,
    renumber: renumber,
  };
})();
