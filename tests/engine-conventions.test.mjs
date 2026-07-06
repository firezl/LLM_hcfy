import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    enrichEngineDefinition,
    enginePromptKeys,
    engineSectionId,
    openAiCompatFieldIds,
} from "../libs/engine-conventions.mjs";
import {
    ENGINE_DEFINITIONS,
    OPENAI_COMPAT_MODEL_ENGINES,
} from "../libs/engine-registry.mjs";

describe("engine-conventions", () => {
    it("derives glm field ids from engine id", () => {
        assert.deepEqual(openAiCompatFieldIds("glm"), {
            apiUrl: "glm_api_url",
            apiKey: "glm_api_key",
            model: "glm_model",
            customModel: "glm_custom_model",
            apiUrlId: "glm_api_url",
            apiKeyId: "glm_api_key",
            modelId: "glm_model",
            customModelId: "glm_custom_model",
        });
    });

    it("enriches llm engine with section and prompt keys", () => {
        const def = enrichEngineDefinition({ id: "glm", kind: "llm" });
        assert.equal(def.sectionId, engineSectionId("glm"));
        assert.deepEqual(enginePromptKeys("glm"), {
            customPromptKey: "glm_custom_prompt",
            systemPromptKey: "glm_system_prompt",
            userPromptKey: "glm_user_prompt",
            customHeadersKey: "glm_custom_headers",
            customPayloadKey: "glm_custom_payload",
        });
    });

    it("gives auto a dedicated options section", () => {
        const def = ENGINE_DEFINITIONS.find((item) => item.id === "auto");
        assert.equal(def.sectionId, "auto_section");
        assert.equal(def.customPromptKey, undefined);
    });

    it("keeps openai compat defaults", () => {
        const deepseek = OPENAI_COMPAT_MODEL_ENGINES.find(
            (cfg) => cfg.name === "deepseek",
        );
        assert.equal(deepseek.apiUrlId, "deepseek_api_url");
        assert.equal(deepseek.defaultModel, "deepseek-v4-flash");
    });
});
