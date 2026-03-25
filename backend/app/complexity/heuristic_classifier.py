"""
Zero-dependency heuristic prompt complexity classifier.

Pure rule-based scoring with <1ms latency, no ML models needed.
Outputs ABSTRACT TIERS only — no model knowledge.
The tier_model_selector maps tiers to the user's configured models by price.

Scoring thresholds (tuned for quality preservation):
  score <= -3  -> SIMPLE  (tier 1) -> cheapest model
  score -2..2  -> MEDIUM  (tier 2) -> mid-tier model (safe default)
  score >= 3   -> COMPLEX (tier 3) -> premium model

Design principle: MEDIUM is the default. Only clearly trivial prompts
go to SIMPLE, only clearly complex prompts go to COMPLEX. When in doubt,
route to MEDIUM — it's the quality-cost sweet spot.
"""

import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pattern constants (compiled once at import time)
# ---------------------------------------------------------------------------

_GREETING_PATTERNS = re.compile(
    r"^(hi|hello|hey|thanks|thank you|good morning|good evening|good night|bye|goodbye|sup|yo)\b",
    re.IGNORECASE,
)

_SIMPLE_QUESTION_PATTERNS = re.compile(
    r"^(what is|who is|when did|when was|how many|how much|where is|where was|what are)\b",
    re.IGNORECASE,
)

_YES_NO_PATTERNS = re.compile(
    r"^(is |are |was |were |do |does |did |can |could |will |would |should |has |have |had )",
    re.IGNORECASE,
)

_DEFINITION_PATTERNS = re.compile(
    r"\b(define|definition of|what does .{1,30} mean|meaning of|explain the term)\b",
    re.IGNORECASE,
)

_SIMPLE_MATH_PATTERNS = re.compile(
    r"\b(calculate|compute|what is \d+\s*[\+\-\*\/\%]\s*\d+|solve .{0,20}\d+\s*[\+\-\*\/])\b",
    re.IGNORECASE,
)

_TRANSLATION_PATTERNS = re.compile(
    r"\b(translate|translation|say .{1,30} in|how do you say)\b",
    re.IGNORECASE,
)

_SMALL_TALK_PATTERNS = re.compile(
    r"^(what time|what day|how are you|tell me a joke|what's up|what is the weather|how's it going)\b",
    re.IGNORECASE,
)

_CODE_BLOCK_PATTERN = re.compile(r"```[\s\S]*?```")

_INDENTED_CODE_PATTERN = re.compile(r"(?:^|\n)(    .+\n){3,}", re.MULTILINE)

_MULTI_STEP_PATTERNS = re.compile(
    r"\b(first|then|next|finally|step \d|after that|subsequently|1\.|2\.|3\.)\b",
    re.IGNORECASE,
)

_NUMBERED_LIST_PATTERN = re.compile(r"(?:^|\n)\s*\d+[\.\)]\s+\S", re.MULTILINE)

_ANALYSIS_KEYWORDS = re.compile(
    r"\b(analy[sz]e|compare|evaluate|design|architect|optimize|debug|refactor|"
    r"implement|review|assess|critique|investigate|diagnose|benchmark|"
    r"trade-?offs?|pros and cons|advantages and disadvantages)\b",
    re.IGNORECASE,
)

_CREATIVE_WRITING_PATTERNS = re.compile(
    r"\b(write a (story|poem|essay|article|blog|script|letter|report|proposal|speech|novel))"
    r"|\b(compose|draft a|create a (narrative|story|poem))",
    re.IGNORECASE,
)

_TECHNICAL_TERMS = re.compile(
    r"\b(api|sql|http|tcp|udp|dns|oauth|jwt|rest|graphql|grpc|kubernetes|docker|"
    r"microservices?|database|algorithm|recursion|async|await|mutex|semaphore|"
    r"regex|lambda|closure|polymorphism|inheritance|encapsulation|abstraction|"
    r"binary tree|hash map|linked list|queue|stack|heap|graph|trie|"
    r"machine learning|neural network|gradient|backpropagation|"
    r"concurrency|parallelism|deadlock|race condition|"
    r"ci/cd|devops|terraform|ansible|nginx|redis|kafka|"
    r"typescript|javascript|python|rust|golang|java|"
    r"react|angular|vue|svelte|nextjs|fastapi|django|flask|"
    r"postgresql|mongodb|cassandra|elasticsearch|"
    r"architecture|fault.toleran|service.mesh|event.sourc|cqrs|"
    r"load.balanc|caching|sharding|replication|consistency|"
    r"distributed|scalab|latency|throughput|availability|"
    r"authentication|authorization|encryption|ssl|tls|"
    r"pipeline|deployment|container|orchestrat|serverless|"
    r"websocket|streaming|real-?time|batch.process)\b",
    re.IGNORECASE,
)

_QUESTION_MARK_PATTERN = re.compile(r"\?")

_MATH_NOTATION_PATTERN = re.compile(
    r"[∑∏∫∂∇√∞≈≠≤≥±×÷∈∉⊂⊃∀∃]|\\(frac|sqrt|sum|int|partial|nabla|infty)"
)


def _estimate_tokens(text: str) -> int:
    """Rough token count: ~1.3 tokens per word for English text."""
    words = len(text.split())
    return int(words * 1.3)


class HeuristicClassifier:
    """
    Zero-dependency heuristic prompt complexity classifier.

    Implements the same interface as BinaryComplexityClassifier so it can
    be used as a drop-in replacement via the analyzer factory.
    """

    CLASSIFIER_VERSION = "1.0-heuristic"

    def __init__(
        self,
        allowed_providers: Optional[List[str]] = None,
        allowed_models: Optional[List[str]] = None,
    ):
        self.allowed_providers = allowed_providers or []
        self.allowed_models = allowed_models or []
        self.performance_data = self._load_performance_data()
        logger.info("HeuristicClassifier v%s ready (zero-dependency)", self.CLASSIFIER_VERSION)

    # ------------------------------------------------------------------
    # Core scoring engine
    # ------------------------------------------------------------------

    def _score_prompt(
        self,
        prompt: str,
        system_message: str = "",
        messages: Optional[List[Dict[str, str]]] = None,
    ) -> Tuple[int, List[str]]:
        """
        Score a prompt on simple/complex indicators.

        Returns (score, reasons) where negative = simple, positive = complex.
        """
        score = 0
        reasons: List[str] = []
        stripped = prompt.strip()
        token_count = _estimate_tokens(stripped)
        char_count = len(stripped)

        # --- SIMPLE indicators (score -1 each) ---

        if token_count < 20 or char_count < 100:
            score -= 1
            reasons.append("short_prompt")

        if _GREETING_PATTERNS.search(stripped):
            score -= 1
            reasons.append("greeting")

        if _SMALL_TALK_PATTERNS.search(stripped):
            score -= 1
            reasons.append("small_talk")

        if _SIMPLE_QUESTION_PATTERNS.search(stripped):
            score -= 1
            reasons.append("simple_factual_question")

        if _SIMPLE_MATH_PATTERNS.search(stripped):
            score -= 1
            reasons.append("simple_math")

        if _TRANSLATION_PATTERNS.search(stripped):
            score -= 1
            reasons.append("translation_request")

        if _YES_NO_PATTERNS.search(stripped):
            score -= 1
            reasons.append("yes_no_question")

        if _DEFINITION_PATTERNS.search(stripped):
            score -= 1
            reasons.append("definition_request")

        # --- MEDIUM indicators (score +1 each) ---
        # These push prompts from simple toward medium but not complex.
        # "write a function", "explain X", "summarize" need mid-tier quality.
        lower = stripped.lower()

        if re.search(r"\b(write a|write an|create a|build a|make a)\b", lower) and not re.search(r"\b(story|poem|essay|novel)\b", lower):
            score += 1
            reasons.append("code_generation_request")

        if re.search(r"\b(explain|describe|summarize|outline|overview)\b", lower):
            score += 1
            reasons.append("explanation_request")

        if re.search(r"\b(pros and cons|advantages|disadvantages|difference between|vs\.?|versus)\b", lower):
            score += 1
            reasons.append("comparison_request")

        # --- COMPLEX indicators (score +1 each, need 2+ to reach threshold) ---

        if token_count > 100 or char_count > 400:
            score += 1
            reasons.append("long_prompt")

        if token_count > 200 or char_count > 800:
            score += 1
            reasons.append("very_long_prompt")

        if _CODE_BLOCK_PATTERN.search(prompt):
            score += 1
            reasons.append("code_block")

        if _INDENTED_CODE_PATTERN.search(prompt):
            score += 1
            reasons.append("indented_code")

        # Multi-step instructions (need at least 2 step indicators)
        step_matches = len(_MULTI_STEP_PATTERNS.findall(stripped))
        numbered_items = len(_NUMBERED_LIST_PATTERN.findall(stripped))
        if step_matches >= 2 or numbered_items >= 3:
            score += 1
            reasons.append("multi_step_instructions")

        # Analysis/reasoning keywords
        analysis_matches = len(_ANALYSIS_KEYWORDS.findall(stripped))
        if analysis_matches >= 1:
            score += 1
            reasons.append("analysis_keywords")
        if analysis_matches >= 3:
            score += 1
            reasons.append("heavy_analysis_keywords")

        # System prompt present and substantial
        if system_message and len(system_message.strip()) > 200:
            score += 1
            reasons.append("substantial_system_prompt")

        # Multiple questions
        question_count = len(_QUESTION_MARK_PATTERN.findall(stripped))
        if question_count >= 3:
            score += 1
            reasons.append("multiple_questions")

        # Technical jargon density
        tech_matches = len(_TECHNICAL_TERMS.findall(stripped))
        word_count = max(len(stripped.split()), 1)
        tech_density = tech_matches / word_count
        if tech_matches >= 3:
            score += 1
            reasons.append("technical_jargon")
        if tech_matches >= 5 or (tech_matches >= 3 and tech_density > 0.15):
            score += 1
            reasons.append("heavy_technical_jargon")

        # Creative writing (longer-form)
        if _CREATIVE_WRITING_PATTERNS.search(stripped):
            score += 1
            reasons.append("creative_writing")

        # Multi-turn conversation
        if messages and len(messages) > 6:
            score += 1
            reasons.append("multi_turn_conversation")

        # Math notation
        if _MATH_NOTATION_PATTERN.search(stripped):
            score += 1
            reasons.append("math_notation")

        return score, reasons

    # ------------------------------------------------------------------
    # classify() — matches BinaryComplexityClassifier signature
    # ------------------------------------------------------------------

    def classify(
        self,
        prompt: str,
        system_message: str = "",
        messages: Optional[List[Dict[str, str]]] = None,
    ) -> Tuple[str, float, Dict[str, float]]:
        """
        Classify a prompt as simple, medium, or complex.

        Returns:
            (tier_name, confidence, tier_probabilities)
        """
        score, reasons = self._score_prompt(prompt, system_message, messages)

        # Thresholds tuned for quality preservation:
        # Only clearly trivial → simple (saves most money, lowest quality)
        # Only clearly complex → complex (highest quality, most expensive)
        # Everything else → medium (safe default, good quality-cost balance)
        if score <= -2:
            tier_name = "simple"
        elif score >= 2:
            tier_name = "complex"
        else:
            tier_name = "medium"

        # Confidence: higher absolute score = more confident
        abs_score = abs(score)
        if abs_score >= 4:
            confidence = 0.95
        elif abs_score >= 3:
            confidence = 0.85
        elif abs_score >= 2:
            confidence = 0.75
        elif abs_score >= 1:
            confidence = 0.55
        else:
            confidence = 0.40

        # Approximate tier probabilities based on score
        if tier_name == "simple":
            tier_probs = {
                "simple": confidence,
                "medium": (1 - confidence) * 0.7,
                "complex": (1 - confidence) * 0.3,
            }
        elif tier_name == "complex":
            tier_probs = {
                "simple": (1 - confidence) * 0.3,
                "medium": (1 - confidence) * 0.7,
                "complex": confidence,
            }
        else:
            tier_probs = {
                "simple": (1 - confidence) * 0.5,
                "medium": confidence,
                "complex": (1 - confidence) * 0.5,
            }

        return tier_name, confidence, tier_probs

    # ------------------------------------------------------------------
    # analyze() — async interface matching factory contract
    # ------------------------------------------------------------------

    async def analyze(self, text: str, **kwargs) -> Dict[str, Any]:
        """Async analyze interface matching the factory contract."""
        return self._analyze_sync(text, **kwargs)

    def _analyze_sync(self, text: str, **kwargs) -> Dict[str, Any]:
        start = time.time()

        system_message = kwargs.get("system_message", "")
        messages = kwargs.get("messages", None)

        tier_name, confidence, tier_probs = self.classify(text, system_message, messages)
        _, reasons = self._score_prompt(text, system_message, messages)

        tier_map = {"simple": 1, "medium": 2, "complex": 3}
        tier = tier_map[tier_name]

        recommended_model, recommended_provider = self._select_model(tier_name, confidence)
        ranked_models = self._build_ranked_models(tier_name, confidence)

        complexity_score = self._tier_to_score(tier_name, confidence)

        latency_ms = round((time.time() - start) * 1000, 2)

        reasoning = (
            f"Heuristic v{self.CLASSIFIER_VERSION}: {tier_name} "
            f"(confidence={confidence:.3f}, indicators={reasons})"
        )

        rationale_map = {
            "simple": "Cheapest model meeting quality threshold for simple complexity",
            "medium": "Best quality-cost ratio model for medium complexity",
            "complex": "Highest quality model for complex prompt",
        }

        return {
            "recommended_model": recommended_model,
            "recommended_provider": recommended_provider,
            "confidence": confidence,
            "complexity_score": complexity_score,
            "complexity_tier": tier,
            "complexity_name": tier_name,
            "tier": tier,
            "tier_name": tier_name,
            "reasoning": reasoning,
            "ranked_models": ranked_models,
            "analyzer_latency_ms": latency_ms,
            "analyzer_type": "heuristic",
            "classifier_version": self.CLASSIFIER_VERSION,
            "selection_method": "heuristic_classifier",
            "model_type": "heuristic_classifier",
            "classification_mode": "rule_based",
            "guardrail_applied": False,
            "heuristic_tier": tier,
            "tier_probabilities": tier_probs,
            "heuristic_factors": reasons,
            "heuristic_scores": {},
            "guardrail_explanation": "",
            "model_selection_rationale": rationale_map.get(tier_name, ""),
        }

    # ------------------------------------------------------------------
    # Model selection helpers (mirrored from BinaryComplexityClassifier)
    # ------------------------------------------------------------------

    def _select_model(self, tier_name: str, confidence: float) -> Tuple[str, str]:
        candidates = self._get_candidate_models()

        if not candidates:
            if self.allowed_models:
                model = self.allowed_models[0]
                provider = model.split("/")[0] if "/" in model else "unknown"
                return model, provider
            return "gpt-4o-mini", "openai"

        if tier_name == "complex":
            candidates.sort(key=lambda m: m["quality_index"], reverse=True)
        elif tier_name == "medium":
            candidates.sort(key=lambda m: m["quality_index"] / max(m["cost"], 0.01), reverse=True)
        else:
            candidates.sort(key=lambda m: m["cost"])

        best = candidates[0]
        return best["api_id"], best["provider"]

    def _build_ranked_models(self, tier_name: str, confidence: float) -> List[Dict[str, Any]]:
        candidates = self._get_candidate_models()
        if not candidates:
            return []

        if tier_name == "complex":
            candidates.sort(key=lambda m: m["quality_index"], reverse=True)
        elif tier_name == "medium":
            candidates.sort(key=lambda m: m["quality_index"] / max(m["cost"], 0.01), reverse=True)
        else:
            candidates.sort(key=lambda m: m["cost"])

        label = {"simple": "cost", "medium": "balanced", "complex": "quality"}[tier_name]

        ranked = []
        for c in candidates[:10]:
            ranked.append({
                "model_name": c["api_id"],
                "provider": c["provider"],
                "confidence": confidence,
                "reasoning": f"Heuristic classifier: {tier_name} -> {label} priority",
                "cost_per_million_tokens": c["cost"],
                "quality_index": c["quality_index"],
                "api_id": c["api_id"],
                "performance_name": c["model_name"],
                "suitability_score": (
                    c["quality_index"]
                    if tier_name == "complex"
                    else (c["quality_index"] / max(c["cost"], 0.01))
                    if tier_name == "medium"
                    else max(0, 100 - c["cost"] * 10)
                ),
            })
        return ranked

    def _get_candidate_models(self) -> List[Dict[str, Any]]:
        if not self.performance_data:
            return []

        candidates = []
        for model in self.performance_data:
            api_id = model.get("api_id", "")
            model_name = model.get("model", "")
            provider = model.get("api_provider", "").lower()
            route = (model.get("other", {}).get("other", {}).get("route", "") or "").lower()

            if self.allowed_providers:
                allowed_lower = [p.lower() for p in self.allowed_providers]
                if provider not in allowed_lower and route not in allowed_lower:
                    continue

            if self.allowed_models:
                if not any(a in (model_name, api_id) for a in self.allowed_models):
                    continue

            perf = model.get("other", {}).get("performance", {})
            pricing = model.get("other", {}).get("pricing", {})

            try:
                quality_index = float(perf.get("quality_index", 50))
            except (ValueError, TypeError):
                quality_index = 50.0

            try:
                cost = float(pricing.get("blended_usd1m_tokens", 1.0))
            except (ValueError, TypeError):
                cost = 1.0

            candidates.append({
                "api_id": api_id,
                "model_name": model_name,
                "provider": route or provider,
                "quality_index": quality_index,
                "cost": cost,
            })

        known_ids = {c["api_id"] for c in candidates}
        for m in (self.allowed_models or []):
            if m not in known_ids:
                provider = m.split("/")[0] if "/" in m else "unknown"
                candidates.append({
                    "api_id": m,
                    "model_name": m,
                    "provider": provider,
                    "quality_index": 30.0,
                    "cost": 0.0,
                })

        return candidates

    @staticmethod
    def _tier_to_score(tier_name: str, confidence: float) -> float:
        base = {"simple": 0.15, "medium": 0.5, "complex": 0.85}[tier_name]
        offset = min(confidence * 2, 0.15)
        if tier_name == "complex":
            return min(base + offset, 1.0)
        elif tier_name == "simple":
            return max(base - offset, 0.0)
        else:
            return base

    def _load_performance_data(self) -> List[Dict]:
        try:
            path = os.path.join(
                os.path.dirname(__file__),
                "..",
                "reference_data",
                "model_performance_clean.json",
            )
            with open(path) as f:
                data = json.load(f)
            return data.get("models", [])
        except Exception as e:
            logger.warning("HeuristicClassifier: could not load performance data: %s", e)
            return []


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------

def get_heuristic_classifier(
    allowed_providers: Optional[List[str]] = None,
    allowed_models: Optional[List[str]] = None,
) -> HeuristicClassifier:
    """Create a heuristic classifier instance."""
    return HeuristicClassifier(
        allowed_providers=allowed_providers,
        allowed_models=allowed_models,
    )
