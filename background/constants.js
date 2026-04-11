export const PORT_NAME = "jyt-translate";

export const MESSAGE_TYPE_START = "TRANSLATE_START";
export const MESSAGE_TYPE_WEBLLM_PRELOAD = "WEBLLM_PRELOAD";
export const MESSAGE_TYPE_WEBLLM_CLEAR_CACHE = "WEBLLM_CLEAR_CACHE";
export const MESSAGE_TYPE_WEBLLM_GET_MODELS = "WEBLLM_GET_MODELS";
export const MESSAGE_TYPE_OLLAMA_GET_MODELS = "OLLAMA_GET_MODELS";
export const MESSAGE_TYPE_TERM_UPSERT = "TERM_UPSERT";
export const MESSAGE_TYPE_TERM_IMPORT = "TERM_IMPORT";
export const MESSAGE_TYPE_TERM_EXPORT = "TERM_EXPORT";
export const MESSAGE_TYPE_TERM_LIST = "TERM_LIST";
export const MESSAGE_TYPE_TERM_DELETE = "TERM_DELETE";
export const MESSAGE_TYPE_TERM_CLEAR = "TERM_CLEAR";
export const MESSAGE_TYPE_CONFIG_EXPORT = "CONFIG_EXPORT";
export const MESSAGE_TYPE_CONFIG_IMPORT = "CONFIG_IMPORT";
export const MESSAGE_TYPE_SYNC_TEST = "SYNC_TEST";
export const MESSAGE_TYPE_SYNC_UPLOAD = "SYNC_UPLOAD";
export const MESSAGE_TYPE_SYNC_DOWNLOAD = "SYNC_DOWNLOAD";
export const MESSAGE_TYPE_SYNC_BIDIRECTIONAL = "SYNC_BIDIRECTIONAL";
export const MESSAGE_TYPE_PDF_CHECK_URL = "PDF_CHECK_URL";
export const MESSAGE_TYPE_PDF_OPEN_IN_VIEWER = "PDF_OPEN_IN_VIEWER";
export const MESSAGE_TYPE_PDF_PROMPT_OFFER = "PDF_PROMPT_OFFER";
export const MESSAGE_TYPE_PDF_PROMPT_VERDICT = "PDF_PROMPT_VERDICT";
export const MESSAGE_TYPE_PDF_PROMPT_DECISION = "PDF_PROMPT_DECISION";
export const MESSAGE_TYPE_PDF_GET_PENDING_PROMPT = "PDF_GET_PENDING_PROMPT";

export const SYNC_CONFLICT_POLICY_ASK = "ask";
export const SYNC_CONFLICT_POLICY_REMOTE_WINS = "remote_wins";
export const SYNC_CONFLICT_POLICY_LOCAL_WINS = "local_wins";
export const SYNC_CONFLICT_POLICY_MERGE_NEWEST = "merge_newest";

export const SYNC_ERROR_CONFLICT = "SYNC_CONFLICT";

export const RECOMMENDED_WEBLLM_MODELS = [
    "Qwen3-0.6B-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
];

export const PDF_VIEWER_PATH = "vendor/pdfjs/web/viewer.html";
export const DEFAULT_WEBLLM_MODEL = "Qwen3-0.6B-q4f16_1-MLC";

export const WEBLLM_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
export const WEBLLM_IDLE_CHECK_INTERVAL_MS = 60 * 1000;

export const HUGGINGFACE_BASE = "https://huggingface.co";
export const GOOGLE_TRANSLATE_ENDPOINT =
    "https://translate.googleapis.com/translate_a/single";
export const BING_TRANSLATOR_PAGE_URL = "https://www.bing.com/translator";
export const BING_AUTH_TTL_MS = 10 * 60 * 1000;

export const SYNC_CONFIG_FILE = "config.json";
export const SYNC_GLOSSARY_FILE = "glossary.json";
