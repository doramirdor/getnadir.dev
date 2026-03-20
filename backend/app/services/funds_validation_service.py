"""
Funds Validation Service - Comprehensive user funds management and validation.

This service handles:
1. Checking if users have sufficient funds for requests
2. Managing multiple funding sources (tokens, credit cards, promotional credits)
3. Handling BYOK (Bring Your Own Keys) routing fees
4. Processing fund deductions and credits
5. Auto-reload functionality
"""
import logging
from typing import Dict, Any, Optional, Tuple, List
from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass
from datetime import datetime
import uuid

from app.auth.supabase_auth import supabase
from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class FundsStatus:
    """User funds status information."""
    user_id: str
    total_available_usd: Decimal
    token_balance_usd: Decimal
    credit_balance_usd: Decimal
    promotional_balance_usd: Decimal
    spent_this_month_usd: Decimal
    spending_limit_usd: Optional[Decimal]
    is_active: bool
    is_frozen: bool
    has_sufficient_funds: bool
    auto_reload_enabled: bool


@dataclass
class CostBreakdown:
    """Detailed cost breakdown for a request."""
    base_llm_cost_usd: Decimal
    routing_fee_usd: Decimal
    total_cost_usd: Decimal
    uses_byok: bool
    routing_strategy: str
    estimated_tokens: int


@dataclass
class TransactionResult:
    """Result of a fund transaction."""
    success: bool
    transaction_id: Optional[str]
    new_balance_usd: Decimal
    message: str
    auto_reload_triggered: bool = False


class FundsValidationService:
    """Service for validating and managing user funds."""
    
    def __init__(self):
        """Initialize the funds validation service."""
        self.default_routing_fee = Decimal('0.002')  # $0.002 per request for smart routing
        self.byok_routing_fee = Decimal('0.002')     # $0.002 per request when using BYOK
        
    async def get_user_funds_status(self, user_id: str) -> FundsStatus:
        """
        Get comprehensive funds status for a user.
        
        Args:
            user_id: User UUID
            
        Returns:
            FundsStatus object with complete fund information
        """
        try:
            # Get user funds from database
            result = supabase.table("user_funds").select("*").eq("user_id", user_id).execute()
            
            if not result.data:
                # Initialize funds for new user
                logger.info(f"Initializing funds for new user: {user_id}")
                await self._initialize_user_funds(user_id)
                # Retry after initialization
                result = supabase.table("user_funds").select("*").eq("user_id", user_id).execute()
                
            if not result.data:
                raise Exception(f"Could not initialize funds for user {user_id}")
                
            funds_data = result.data[0]
            
            # Convert to Decimal for precise calculations
            total_available = Decimal(str(funds_data.get('total_available_usd', 0)))
            token_balance = Decimal(str(funds_data.get('token_balance_usd', 0)))
            credit_balance = Decimal(str(funds_data.get('credit_balance_usd', 0)))
            promotional_balance = Decimal(str(funds_data.get('promotional_balance_usd', 0)))
            spent_this_month = Decimal(str(funds_data.get('spent_this_month_usd', 0)))
            spending_limit = funds_data.get('spending_limit_usd')
            spending_limit = Decimal(str(spending_limit)) if spending_limit else None
            
            return FundsStatus(
                user_id=user_id,
                total_available_usd=total_available,
                token_balance_usd=token_balance,
                credit_balance_usd=credit_balance,
                promotional_balance_usd=promotional_balance,
                spent_this_month_usd=spent_this_month,
                spending_limit_usd=spending_limit,
                is_active=funds_data.get('is_active', True),
                is_frozen=funds_data.get('is_frozen', False),
                has_sufficient_funds=total_available > 0,
                auto_reload_enabled=funds_data.get('auto_reload_enabled', False)
            )
            
        except Exception as e:
            logger.error(f"Error getting funds status for user {user_id}: {e}")
            # Return default status for error cases
            return FundsStatus(
                user_id=user_id,
                total_available_usd=Decimal('0'),
                token_balance_usd=Decimal('0'),
                credit_balance_usd=Decimal('0'),
                promotional_balance_usd=Decimal('0'),
                spent_this_month_usd=Decimal('0'),
                spending_limit_usd=None,
                is_active=True,
                is_frozen=False,
                has_sufficient_funds=False,
                auto_reload_enabled=False
            )
    
    async def calculate_request_cost(
        self, 
        model: str, 
        estimated_tokens: int,
        user_id: str,
        uses_byok: bool = False,
        routing_strategy: str = "smart-routing"
    ) -> CostBreakdown:
        """
        Calculate the total cost for a request including routing fees.
        
        Args:
            model: Model name
            estimated_tokens: Estimated token count
            user_id: User ID for BYOK checking
            uses_byok: Whether using user's own API keys
            routing_strategy: Routing strategy used
            
        Returns:
            CostBreakdown with detailed cost information
        """
        try:
            # Estimate base LLM cost (simplified - in production, use actual pricing)
            base_llm_cost = self._estimate_llm_cost(model, estimated_tokens)
            
            # Calculate routing fee
            routing_fee = Decimal('0')
            
            if uses_byok:
                # BYOK: Only routing fee (no LLM cost as user pays directly)
                base_llm_cost = Decimal('0')  # User pays provider directly
                routing_fee = self.byok_routing_fee
            else:
                # Standard routing: LLM cost + routing fee
                if routing_strategy == "smart-routing":
                    routing_fee = self.default_routing_fee
                else:
                    routing_fee = Decimal('0')  # No routing fee for direct calls
            
            total_cost = base_llm_cost + routing_fee
            
            return CostBreakdown(
                base_llm_cost_usd=base_llm_cost,
                routing_fee_usd=routing_fee,
                total_cost_usd=total_cost,
                uses_byok=uses_byok,
                routing_strategy=routing_strategy,
                estimated_tokens=estimated_tokens
            )
            
        except Exception as e:
            logger.error(f"Error calculating request cost: {e}")
            # Return conservative estimate for errors
            return CostBreakdown(
                base_llm_cost_usd=Decimal('0.01'),
                routing_fee_usd=self.default_routing_fee,
                total_cost_usd=Decimal('0.012'),
                uses_byok=uses_byok,
                routing_strategy=routing_strategy,
                estimated_tokens=estimated_tokens
            )
    
    async def validate_sufficient_funds(
        self, 
        user_id: str, 
        cost_breakdown: CostBreakdown
    ) -> Tuple[bool, str, Optional[FundsStatus]]:
        """
        Validate if user has sufficient funds for a request.
        
        Args:
            user_id: User UUID
            cost_breakdown: Cost breakdown for the request
            
        Returns:
            Tuple of (has_sufficient_funds, message, funds_status)
        """
        try:
            funds_status = await self.get_user_funds_status(user_id)
            
            # Check if account is frozen
            if funds_status.is_frozen:
                return False, "Account is frozen. Please contact support.", funds_status
            
            # Check if account is active
            if not funds_status.is_active:
                return False, "Account is inactive.", funds_status
            
            # Check spending limit
            if funds_status.spending_limit_usd:
                if funds_status.spent_this_month_usd + cost_breakdown.total_cost_usd > funds_status.spending_limit_usd:
                    return False, f"Request would exceed monthly spending limit of ${funds_status.spending_limit_usd}", funds_status
            
            # Check available balance
            if cost_breakdown.total_cost_usd > funds_status.total_available_usd:
                shortage = cost_breakdown.total_cost_usd - funds_status.total_available_usd
                if funds_status.auto_reload_enabled:
                    # Trigger auto-reload if enabled
                    reload_success = await self._trigger_auto_reload(user_id)
                    if reload_success:
                        # Re-check funds after reload
                        updated_status = await self.get_user_funds_status(user_id)
                        if cost_breakdown.total_cost_usd <= updated_status.total_available_usd:
                            return True, "Funds auto-reloaded successfully", updated_status
                        else:
                            return False, f"Insufficient funds after auto-reload. Need ${shortage:.4f} more.", updated_status
                    else:
                        return False, f"Insufficient funds and auto-reload failed. Need ${shortage:.4f} more.", funds_status
                else:
                    return False, f"Insufficient funds. Need ${shortage:.4f} more. Available: ${funds_status.total_available_usd:.4f}", funds_status
            
            return True, "Sufficient funds available", funds_status
            
        except Exception as e:
            logger.error(f"Error validating funds for user {user_id}: {e}")
            return False, f"Error validating funds: {str(e)}", None
    
    async def deduct_funds(
        self, 
        user_id: str, 
        cost_breakdown: CostBreakdown,
        request_id: str,
        description: Optional[str] = None
    ) -> TransactionResult:
        """
        Deduct funds from user account after successful request.
        
        Args:
            user_id: User UUID
            cost_breakdown: Cost breakdown for the request
            request_id: Request ID for tracking
            description: Optional description
            
        Returns:
            TransactionResult with transaction details
        """
        try:
            if cost_breakdown.total_cost_usd <= 0:
                logger.info(f"No cost to deduct for request {request_id}")
                funds_status = await self.get_user_funds_status(user_id)
                return TransactionResult(
                    success=True,
                    transaction_id=None,
                    new_balance_usd=funds_status.total_available_usd,
                    message="No cost to deduct"
                )
            
            # Get current funds
            funds_status = await self.get_user_funds_status(user_id)
            
            # Validate sufficient funds
            has_funds, message, updated_status = await self.validate_sufficient_funds(user_id, cost_breakdown)
            if not has_funds:
                return TransactionResult(
                    success=False,
                    transaction_id=None,
                    new_balance_usd=funds_status.total_available_usd,
                    message=message
                )
            
            # Use updated status if available (after auto-reload)
            if updated_status:
                funds_status = updated_status
            
            # Deduct funds using priority: promotional -> token -> credit
            amount_to_deduct = cost_breakdown.total_cost_usd
            new_promotional = funds_status.promotional_balance_usd
            new_token = funds_status.token_balance_usd
            new_credit = funds_status.credit_balance_usd
            
            # Deduct from promotional balance first
            if amount_to_deduct > 0 and new_promotional > 0:
                deduction = min(amount_to_deduct, new_promotional)
                new_promotional -= deduction
                amount_to_deduct -= deduction
            
            # Then from token balance
            if amount_to_deduct > 0 and new_token > 0:
                deduction = min(amount_to_deduct, new_token)
                new_token -= deduction
                amount_to_deduct -= deduction
            
            # Finally from credit balance
            if amount_to_deduct > 0 and new_credit > 0:
                deduction = min(amount_to_deduct, new_credit)
                new_credit -= deduction
                amount_to_deduct -= deduction
            
            if amount_to_deduct > 0:
                return TransactionResult(
                    success=False,
                    transaction_id=None,
                    new_balance_usd=funds_status.total_available_usd,
                    message="Insufficient funds after calculation"
                )
            
            # Update user_funds table
            new_spent_this_month = funds_status.spent_this_month_usd + cost_breakdown.total_cost_usd
            
            update_result = supabase.table("user_funds").update({
                "promotional_balance_usd": float(new_promotional),
                "token_balance_usd": float(new_token),
                "credit_balance_usd": float(new_credit),
                "spent_this_month_usd": float(new_spent_this_month),
                "total_spent_usd": supabase.rpc("increment", {"column": "total_spent_usd", "amount": float(cost_breakdown.total_cost_usd)})
            }).eq("user_id", user_id).execute()
            
            if not update_result.data:
                raise Exception("Failed to update user funds")
            
            # Create transaction record
            transaction_id = str(uuid.uuid4())
            new_total_balance = new_promotional + new_token + new_credit
            
            transaction_data = {
                "id": transaction_id,
                "user_id": user_id,
                "transaction_type": "debit",
                "funding_source": "usage",
                "amount_usd": -float(cost_breakdown.total_cost_usd),
                "balance_before_usd": float(funds_status.total_available_usd),
                "balance_after_usd": float(new_total_balance),
                "description": description or f"Request cost: {cost_breakdown.routing_strategy}",
                "reference_id": request_id,
                "request_id": request_id,
                "metadata": {
                    "base_llm_cost_usd": float(cost_breakdown.base_llm_cost_usd),
                    "routing_fee_usd": float(cost_breakdown.routing_fee_usd),
                    "uses_byok": cost_breakdown.uses_byok,
                    "routing_strategy": cost_breakdown.routing_strategy,
                    "estimated_tokens": cost_breakdown.estimated_tokens
                }
            }
            
            transaction_result = supabase.table("fund_transactions").insert(transaction_data).execute()
            
            if not transaction_result.data:
                logger.error("Failed to create transaction record")
            
            logger.info(f"Successfully deducted ${cost_breakdown.total_cost_usd:.4f} from user {user_id} for request {request_id}")
            
            return TransactionResult(
                success=True,
                transaction_id=transaction_id,
                new_balance_usd=new_total_balance,
                message=f"Successfully deducted ${cost_breakdown.total_cost_usd:.4f}"
            )
            
        except Exception as e:
            logger.error(f"Error deducting funds for user {user_id}: {e}")
            return TransactionResult(
                success=False,
                transaction_id=None,
                new_balance_usd=Decimal('0'),
                message=f"Error processing payment: {str(e)}"
            )
    
    async def add_funds(
        self, 
        user_id: str, 
        amount_usd: Decimal,
        funding_source: str,
        description: str,
        reference_id: Optional[str] = None
    ) -> TransactionResult:
        """
        Add funds to user account.
        
        Args:
            user_id: User UUID
            amount_usd: Amount to add
            funding_source: Source of funds (token, credit_card, promotional)
            description: Description of the transaction
            reference_id: Optional external reference ID
            
        Returns:
            TransactionResult with transaction details
        """
        try:
            if amount_usd <= 0:
                return TransactionResult(
                    success=False,
                    transaction_id=None,
                    new_balance_usd=Decimal('0'),
                    message="Amount must be positive"
                )
            
            # Get current funds
            funds_status = await self.get_user_funds_status(user_id)
            
            # Determine which balance to update
            update_field = f"{funding_source}_balance_usd"
            current_balance = getattr(funds_status, update_field)
            new_balance = current_balance + amount_usd
            
            # Update user_funds table
            update_result = supabase.table("user_funds").update({
                update_field: float(new_balance)
            }).eq("user_id", user_id).execute()
            
            if not update_result.data:
                raise Exception("Failed to update user funds")
            
            # Create transaction record
            transaction_id = str(uuid.uuid4())
            new_total_balance = funds_status.total_available_usd + amount_usd
            
            transaction_data = {
                "id": transaction_id,
                "user_id": user_id,
                "transaction_type": "credit",
                "funding_source": funding_source,
                "amount_usd": float(amount_usd),
                "balance_before_usd": float(funds_status.total_available_usd),
                "balance_after_usd": float(new_total_balance),
                "description": description,
                "reference_id": reference_id,
                "metadata": {
                    "funding_source": funding_source
                }
            }
            
            transaction_result = supabase.table("fund_transactions").insert(transaction_data).execute()
            
            if not transaction_result.data:
                logger.error("Failed to create transaction record")
            
            logger.info(f"Successfully added ${amount_usd:.4f} to user {user_id} from {funding_source}")
            
            return TransactionResult(
                success=True,
                transaction_id=transaction_id,
                new_balance_usd=new_total_balance,
                message=f"Successfully added ${amount_usd:.4f}"
            )
            
        except Exception as e:
            logger.error(f"Error adding funds for user {user_id}: {e}")
            return TransactionResult(
                success=False,
                transaction_id=None,
                new_balance_usd=Decimal('0'),
                message=f"Error adding funds: {str(e)}"
            )
    
    async def check_user_byok_status(self, user_id: str, provider: str) -> bool:
        """
        Check if user has active BYOK (Bring Your Own Keys) for a provider.
        
        Args:
            user_id: User UUID
            provider: Provider name (openai, anthropic, google, etc.)
            
        Returns:
            True if user has active BYOK for the provider
        """
        try:
            result = supabase.table("user_api_keys").select("id").eq("user_id", user_id).eq("provider", provider).eq("is_active", True).execute()
            return len(result.data) > 0
        except Exception as e:
            logger.error(f"Error checking BYOK status for user {user_id}, provider {provider}: {e}")
            return False
    
    def _estimate_llm_cost(self, model: str, tokens: int) -> Decimal:
        """
        Estimate LLM cost based on model and tokens.
        
        Args:
            model: Model name
            tokens: Number of tokens
            
        Returns:
            Estimated cost in USD
        """
        # Simplified cost estimation (in production, use actual pricing tables)
        cost_per_1k_tokens = {
            "gpt-4o": Decimal('0.015'),
            "gpt-4o-mini": Decimal('0.0006'),
            "gpt-3.5-turbo": Decimal('0.002'),
            "claude-3-opus": Decimal('0.045'),
            "claude-3-sonnet": Decimal('0.009'),
            "claude-3-haiku": Decimal('0.0015'),
            "gemini-1.5-pro": Decimal('0.0035'),
            "gemini-1.5-flash": Decimal('0.0007'),
        }
        
        # Find base model name
        model_lower = model.lower()
        for model_key, cost in cost_per_1k_tokens.items():
            if model_key in model_lower:
                return (cost * tokens / 1000).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        
        # Default cost for unknown models
        return (Decimal('0.002') * tokens / 1000).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    
    async def _initialize_user_funds(self, user_id: str, initial_credit: Decimal = Decimal('0')) -> bool:
        """
        Initialize funds for a new user.
        
        Args:
            user_id: User UUID
            initial_credit: Initial promotional credit to give
            
        Returns:
            True if successful
        """
        try:
            # Use the SQL function to initialize funds
            result = supabase.rpc("initialize_user_funds", {
                "p_user_id": user_id,
                "p_initial_credit_usd": float(initial_credit)
            }).execute()
            
            logger.info(f"Initialized funds for user {user_id} with ${initial_credit} initial credit")
            return True
            
        except Exception as e:
            logger.error(f"Error initializing funds for user {user_id}: {e}")
            return False
    
    async def _trigger_auto_reload(self, user_id: str) -> bool:
        """
        Trigger auto-reload for a user.
        
        Args:
            user_id: User UUID
            
        Returns:
            True if auto-reload was successful
        """
        try:
            # Get user funds to check auto-reload settings
            funds_status = await self.get_user_funds_status(user_id)
            
            if not funds_status.auto_reload_enabled:
                return False
            
            # In a real implementation, this would:
            # 1. Get user's default payment method
            # 2. Charge the payment method
            # 3. Add funds to account
            
            # For now, we'll simulate successful auto-reload
            auto_reload_amount = Decimal('10.00')  # Default auto-reload amount
            
            result = await self.add_funds(
                user_id=user_id,
                amount_usd=auto_reload_amount,
                funding_source="credit_card",
                description="Auto-reload from default payment method",
                reference_id=f"auto_reload_{datetime.now().timestamp()}"
            )
            
            return result.success
            
        except Exception as e:
            logger.error(f"Error during auto-reload for user {user_id}: {e}")
            return False


# Global instance
funds_service = FundsValidationService()