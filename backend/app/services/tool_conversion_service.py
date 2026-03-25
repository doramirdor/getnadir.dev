"""
Tool and function conversion service for cross-provider compatibility.

This service detects and converts between different function calling
and tool use formats used by different LLM providers:
- OpenAI function calling
- Anthropic tool use
- Google (Gemini) function calling
"""
import json
import re
from typing import Dict, List, Any, Optional, Union


class ToolConversionService:
    """Service to convert between different tool and function formats."""
    
    def __init__(self):
        """Initialize the conversion service."""
        # Define known provider formats
        self.PROVIDERS = {
            "openai": ["gpt-4", "gpt-3.5", "gpt-4o", "gpt-4-turbo"],
            "anthropic": ["claude-", "claude-3", "claude-3.5", "claude-3.7"],
            "google": ["gemini-", "vertex-", "palm-"],
        }
    
    def detect_tool_format(self, prompt: str) -> Optional[str]:
        """
        Detect what tool/function format is used in the prompt.
        
        Args:
            prompt: The user prompt text
            
        Returns:
            String identifier of the detected format ("anthropic_tool", "openai_function", 
            "gemini_function") or None if no format detected
        """
        # Check for Anthropic tool schema
        if re.search(r'"tools"\s*:\s*\[\s*{\s*"type"\s*:', prompt, re.DOTALL) or \
           re.search(r'"type"\s*:\s*"text_editor_\d+"', prompt, re.DOTALL):
            return "anthropic_tool"
        
        # Check for OpenAI function calling
        if re.search(r'"functions"\s*:\s*\[\s*{', prompt, re.DOTALL) or \
           re.search(r'"function_call"\s*:\s*"auto"', prompt, re.DOTALL) or \
           re.search(r'openai\.chat\.completions\.create', prompt, re.DOTALL):
            return "openai_function"
            
        # Check for Gemini function calling
        if re.search(r'genai\.generate_content.*function_calling=', prompt, re.DOTALL) or \
           re.search(r'model\.generate_content.*function_calling=', prompt, re.DOTALL):
            return "gemini_function"
            
        return None
    
    def get_compatible_models(self, tool_format: str) -> List[str]:
        """
        Get a list of models compatible with the detected tool format.
        
        Args:
            tool_format: The detected tool format
            
        Returns:
            List of model name prefixes compatible with this format
        """
        if tool_format == "anthropic_tool":
            return self.PROVIDERS["anthropic"]
        elif tool_format == "openai_function":
            return self.PROVIDERS["openai"]
        elif tool_format == "gemini_function":
            return self.PROVIDERS["google"]
        else:
            # If no specific tool format detected, all models are compatible
            all_models = []
            for provider_models in self.PROVIDERS.values():
                all_models.extend(provider_models)
            return all_models
    
    def convert_openai_to_anthropic(self, functions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert OpenAI function definitions to Anthropic tool format."""
        tools = []
        
        for func in functions:
            # Convert basic function to Anthropic tool
            if func.get("name") == "code_editor":
                # Special case for code editor
                tools.append({
                    "type": "text_editor_20250429",
                    "name": "str_replace_based_edit_tool",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "code": {
                                "type": "string", 
                                "description": "The original source code to be edited"
                            },
                            "instructions": {
                                "type": "string",
                                "description": "Instructions for how to edit the code"
                            }
                        },
                        "required": ["code", "instructions"]
                    }
                })
            else:
                # Generic function conversion
                tool = {
                    "type": "function",
                    "name": func.get("name", ""),
                    "description": func.get("description", ""),
                    "input_schema": func.get("parameters", {})
                }
                tools.append(tool)
                
        return tools
    
    def convert_anthropic_to_openai(self, tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert Anthropic tool definitions to OpenAI function format."""
        functions = []
        
        for tool in tools:
            if tool.get("type") == "text_editor_20250429":
                # Special case for text editor
                functions.append({
                    "name": "code_editor",
                    "description": "Edits the given code according to the edit instructions",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "code": {
                                "type": "string",
                                "description": "The original source code to be edited"
                            },
                            "edit_instruction": {
                                "type": "string",
                                "description": "Instructions describing how to edit the code"
                            }
                        },
                        "required": ["code", "edit_instruction"]
                    }
                })
            else:
                # Generic tool conversion
                function = {
                    "name": tool.get("name", ""),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {})
                }
                functions.append(function)
                
        return functions
    
    def convert_to_gemini_format(self, 
                               tools_or_functions: List[Dict[str, Any]], 
                               format_type: str) -> List[Dict[str, Any]]:
        """
        Convert either Anthropic tools or OpenAI functions to Gemini function format.
        
        Args:
            tools_or_functions: List of tool/function definitions
            format_type: Either "anthropic_tool" or "openai_function"
            
        Returns:
            List of functions in Gemini format
        """
        gemini_functions = []
        
        if format_type == "anthropic_tool":
            # Convert from Anthropic tool format
            for tool in tools_or_functions:
                if tool.get("type") == "text_editor_20250429":
                    # Special case for text editor
                    gemini_functions.append({
                        "name": "code_editor",
                        "description": "Edits code based on instructions",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "code": {
                                    "type": "string",
                                    "description": "Original code"
                                },
                                "instructions": {
                                    "type": "string",
                                    "description": "Edit instructions"
                                }
                            }
                        }
                    })
                else:
                    # Generic tool conversion
                    gemini_functions.append({
                        "name": tool.get("name", ""),
                        "description": tool.get("description", ""),
                        "parameters": tool.get("input_schema", {})
                    })
        else:
            # Convert from OpenAI function format (mostly compatible with Gemini)
            gemini_functions = tools_or_functions.copy()
            
        return gemini_functions
    
    def extract_tools_from_prompt(self, prompt: str, format_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Extract tool/function definitions from a prompt.
        
        Args:
            prompt: The user prompt
            format_type: Optional format type to specify parsing method
            
        Returns:
            List of tool/function definitions extracted from the prompt
        """
        if not format_type:
            format_type = self.detect_tool_format(prompt)
            
        if not format_type:
            return []
            
        # Look for JSON-like structures in the prompt
        json_pattern = r'(\[?\s*{\s*"[^"]+"\s*:.*?}\s*\]?)'
        matches = re.findall(json_pattern, prompt, re.DOTALL)
        
        for match in matches:
            try:
                # Try to parse as JSON
                data = json.loads(match)
                
                # Check if this looks like tools/functions
                if isinstance(data, list) and all(isinstance(item, dict) for item in data):
                    if format_type == "anthropic_tool" and any("type" in item for item in data):
                        return data
                    elif format_type == "openai_function" and any("name" in item for item in data):
                        return data
                elif isinstance(data, dict):
                    # Single tool/function
                    if format_type == "anthropic_tool" and "type" in data:
                        return [data]
                    elif format_type == "openai_function" and "name" in data:
                        return [data]
            except json.JSONDecodeError:
                continue
                
        return []
    
    def determine_best_models(self, prompt: str) -> List[str]:
        """
        Determine the best models for handling a prompt based on detected tool format.
        
        Args:
            prompt: The user prompt
            
        Returns:
            List of model prefixes compatible with the detected tool format
        """
        format_type = self.detect_tool_format(prompt)
        if not format_type:
            # No specific tool format detected, all models are compatible
            return []
            
        # Get compatible models based on format
        return self.get_compatible_models(format_type)
    
    def convert_prompt(self, 
                      prompt: str, 
                      target_format: str, 
                      source_format: Optional[str] = None) -> str:
        """
        Convert a prompt from one tool format to another.
        
        Args:
            prompt: The original prompt
            target_format: The target format to convert to
            source_format: Optional source format (will be detected if not provided)
            
        Returns:
            The prompt converted to the target format
        """
        if not source_format:
            source_format = self.detect_tool_format(prompt)
            
        if not source_format or source_format == target_format:
            # No conversion needed
            return prompt
            
        # Extract tools/functions from the prompt
        tools_or_functions = self.extract_tools_from_prompt(prompt, source_format)
        
        if not tools_or_functions:
            # No tools/functions found to convert
            return prompt
            
        # Convert to the target format
        converted_tools = []
        
        if source_format == "openai_function" and target_format == "anthropic_tool":
            converted_tools = self.convert_openai_to_anthropic(tools_or_functions)
        elif source_format == "anthropic_tool" and target_format == "openai_function":
            converted_tools = self.convert_anthropic_to_openai(tools_or_functions)
        elif target_format == "gemini_function":
            converted_tools = self.convert_to_gemini_format(tools_or_functions, source_format)
            
        # Replace the original tools/functions in the prompt with the converted ones
        converted_json = json.dumps(converted_tools, indent=2)
        
        # This is a simplified approach - in a real implementation, you would need more
        # sophisticated prompt transformation logic
        return prompt.replace(json.dumps(tools_or_functions), converted_json) 