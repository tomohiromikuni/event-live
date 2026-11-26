/** URL の言語の部分（/en・/zh・/zh-tw・/ko・/vi）。middleware でも使うので翻訳表を読み込まない小さなファイルに置く */
export const LANG_PATH_RE = /^\/(en|zh-tw|zh|ko|vi)(?=\/|$)/;
/** やめた言語（/pt・/tl）。日本語の同じページへ転送する */
export const DROPPED_LANG_RE = /^\/(pt|tl)(?=\/|$)/;
