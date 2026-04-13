/**
 * Analyse locale des désignations articles.
 * Catégories : génériques, similaires (60-88%), variantes (diff chiffres only), doublons (identiques ou ≥88%)
 */
sap.ui.define([], function () {
  "use strict";

  var STOP_WORDS = new Set([
    "de", "du", "la", "le", "les", "des", "un", "une", "et", "en", "au", "aux",
    "pour", "par", "sur", "avec", "sans", "the", "a", "an", "of", "for", "and",
    "to", "in", "on", "at", "by", "or", "is", "are", "be", "as"
  ]);

  var GENERIC_WORDS = [
    "test", "essai", "temp", "tmp", "article", "produit", "product", "item",
    "divers", "misc", "xxx", "zzz", "tbd", "tbc", "na", "n/a", "neant", "néant",
    "nouveau", "new", "copy", "copie", "ancien", "old"
  ];

  function levenshteinSimilarity(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) { return 1; }
    if (!a.length || !b.length) { return 0; }
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = [i]; }
    for (var j = 0; j <= n; j++) { dp[0][j] = j; }
    for (var ii = 1; ii <= m; ii++) {
      for (var jj = 1; jj <= n; jj++) {
        dp[ii][jj] = a[ii-1] === b[jj-1]
          ? dp[ii-1][jj-1]
          : 1 + Math.min(dp[ii-1][jj-1], dp[ii-1][jj], dp[ii][jj-1]);
      }
    }
    return 1 - dp[m][n] / Math.max(m, n);
  }

  function tokenize(s) {
    return s.toLowerCase()
      .replace(/[^a-z0-9àâäéèêëîïôùûüç\s\-]/g, " ")
      .split(/[\s\-]+/)
      .filter(function (w) { return w.length > 1 && !STOP_WORDS.has(w); });
  }

  function jaccardSimilarity(a, b) {
    var setA = new Set(tokenize(a));
    var setB = new Set(tokenize(b));
    if (setA.size === 0 && setB.size === 0) { return 1; }
    var intersection = 0;
    setA.forEach(function (w) { if (setB.has(w)) { intersection++; } });
    var union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  function areIdentical(a, b) {
    return a.toLowerCase().trim() === b.toLowerCase().trim();
  }

  /**
   * Les deux descriptions ne diffèrent QUE par des chiffres (ou l'absence de chiffre)
   * ex: "produit fini" vs "produit fini 5"  → true
   * ex: "Drive Arm Length 50" vs "Drive Arm Length 75" → true
   */
  function differsByNumberOnly(a, b) {
    var na = a.toLowerCase().trim().replace(/\d+([.,]\d+)?/g, "").replace(/\s+/g, " ").trim();
    var nb = b.toLowerCase().trim().replace(/\d+([.,]\d+)?/g, "").replace(/\s+/g, " ").trim();
    // Après suppression des chiffres, les textes de base sont identiques
    return na === nb && na.length > 0;
  }

  function isGeneric(desc) {
    if (!desc || desc.trim().length === 0) { return true; }
    var s = desc.trim().toLowerCase();
    if (s.length <= 4) { return true; }
    if (tokenize(s).length <= 1) { return true; }
    for (var i = 0; i < GENERIC_WORDS.length; i++) {
      if (s.indexOf(GENERIC_WORDS[i]) !== -1) { return true; }
    }
    if (/^[\d\s\-_\/\.]+$/.test(s)) { return true; }
    return false;
  }

  function analyze(aArticles) {
    var aGenerics   = [];
    var aDuplicates = [];
    var aVariants   = [];
    var aSimilar    = [];

    // 1. Génériques
    aArticles.forEach(function (o) {
      if (isGeneric(o.ProductDescription)) {
        aGenerics.push({ product: o.Product, description: o.ProductDescription || "(vide)" });
      }
    });

    // 2. Comparaison par paires
    for (var i = 0; i < aArticles.length; i++) {
      for (var j = i + 1; j < aArticles.length; j++) {
        var dA = aArticles[i].ProductDescription || "";
        var dB = aArticles[j].ProductDescription || "";
        if (!dA || !dB) { continue; }

        var pairA = { product: aArticles[i].Product, description: dA };
        var pairB = { product: aArticles[j].Product, description: dB };

        // Doublon : descriptions identiques
        if (areIdentical(dA, dB)) {
          aDuplicates.push({ score: 1, reason: "identical", a: pairA, b: pairB });
          continue;
        }

        // Variante : ne diffèrent que par un chiffre
        if (differsByNumberOnly(dA, dB)) {
          aVariants.push({ score: 1, a: pairA, b: pairB });
          continue;
        }

        // Score de similarité
        var lev   = levenshteinSimilarity(dA, dB);
        var jacc  = jaccardSimilarity(dA, dB);
        var score = Math.max(lev, jacc);

        if (score >= 0.88) {
          // Très similaires → doublon probable
          aDuplicates.push({ score: score, reason: "very_similar", a: pairA, b: pairB });
        } else if (score >= 0.60) {
          aSimilar.push({ score: score, a: pairA, b: pairB });
        }
      }
    }

    aSimilar.sort(function (x, y) { return y.score - x.score; });

    return {
      totalAnalyzed: aArticles.length,
      generics:      aGenerics,
      similar:       aSimilar,
      variants:      aVariants,
      duplicates:    aDuplicates
    };
  }

  return { analyze: analyze };
});
