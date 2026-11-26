/** URL の言語の部分（/en・/zh・/zh-tw・/ko・/vi・/pt・/tl）。middleware でも使うので翻訳表を読み込まない小さなファイルに置く */
export const LANG_PATH_RE = /^\/(en|zh-tw|zh|ko|vi|pt|tl)(?=\/|$)/;
