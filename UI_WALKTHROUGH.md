# Configuration UI Screenshots and Walkthrough

## User Interface Flow

### Step 1: Opening the Configuration UI
The user opens the Command Palette and types "Configure Model Temperature":

```
Command Palette:
┌─────────────────────────────────────────────────────┐
│ > Configure Model Temperature                       │
├─────────────────────────────────────────────────────┤
│ > Synthetic: Configure Model Temperature            │
└─────────────────────────────────────────────────────┘
```

### Step 2: Selecting a Model
A Quick Pick menu appears showing all available models with their current temperature settings:

```
Quick Pick:
┌─────────────────────────────────────────────────────┐
│ Select a model to configure temperature             │
├─────────────────────────────────────────────────────┤
│ gpt-4                                    Default    │
│ claude-2                                 1.20       │
│ llama-2-70b                              0.50       │
│ deepseek-ai/DeepSeek-V3.1-Terminus       Default    │
│ moonshotai/Kimi-K2-Instruct-0905        Default    │
└─────────────────────────────────────────────────────┘
```

- The left column shows the model ID
- The right column shows the current temperature (or "Default" if not set)

### Step 3: Entering Temperature Value
After selecting a model, an input box appears for entering the temperature:

```
Input Box:
┌─────────────────────────────────────────────────────┐
│ Set Temperature for gpt-4                           │
├─────────────────────────────────────────────────────┤
│ Enter temperature value (0-2, or leave empty to     │
│ use default)                                        │
├─────────────────────────────────────────────────────┤
│ [1.5                                            ]   │
└─────────────────────────────────────────────────────┘
```

### Step 4: Validation
If the user enters an invalid value, an error message appears:

```
Invalid Input Examples:
┌─────────────────────────────────────────────────────┐
│ [abc                                            ]   │
│ ⚠ Please enter a valid number                       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ [3.5                                            ]   │
│ ⚠ Temperature must be between 0 and 2               │
└─────────────────────────────────────────────────────┘
```

### Step 5: Success Confirmation
After successfully setting a temperature, a notification appears:

```
Success Message (bottom-right):
┌─────────────────────────────────────────────────────┐
│ ℹ Temperature for gpt-4 set to 1.5                  │
└─────────────────────────────────────────────────────┘
```

### Step 6: Resetting to Default
To reset a model to default, the user selects it and leaves the input empty:

```
Input Box:
┌─────────────────────────────────────────────────────┐
│ Set Temperature for gpt-4                           │
├─────────────────────────────────────────────────────┤
│ Enter temperature value (0-2, or leave empty to     │
│ use default)                                        │
├─────────────────────────────────────────────────────┤
│ [                                               ]   │
│   (User pressed backspace to clear the value)       │
└─────────────────────────────────────────────────────┘

Success Message:
┌─────────────────────────────────────────────────────┐
│ ℹ Temperature for gpt-4 reset to default            │
└─────────────────────────────────────────────────────┘
```

## Alternative Access: VS Code Settings UI

Users can also view and edit temperature settings directly in VS Code settings:

### Settings UI Path:
1. Open Settings (Ctrl+, or Cmd+,)
2. Search for "Synthetic"
3. Find "Synthetic: Model Temperatures"

### Settings View:
```
Settings:
┌─────────────────────────────────────────────────────┐
│ Synthetic Provider                                  │
├─────────────────────────────────────────────────────┤
│ Synthetic: Model Temperatures                       │
│ Custom temperature values for each model. Keys are  │
│ model IDs, values are temperature numbers between   │
│ 0 and 2.                                            │
│                                                     │
│ Edit in settings.json                               │
├─────────────────────────────────────────────────────┤
│ {                                                   │
│   "gpt-4": 1.5,                                     │
│   "claude-2": 1.2,                                  │
│   "llama-2-70b": 0.5                                │
│ }                                                   │
└─────────────────────────────────────────────────────┘
```

## Integration with Chat

When a user selects a model in GitHub Copilot Chat that has a custom temperature:

```
Chat Interface:
┌─────────────────────────────────────────────────────┐
│ Model: gpt-4 (Temperature: 1.5)                     │
├─────────────────────────────────────────────────────┤
│ User: Write a hello world program                  │
│                                                     │
│ Assistant: [Response with temperature 1.5]          │
└─────────────────────────────────────────────────────┘
```

The custom temperature is automatically applied to all API requests for that model.

## Benefits

1. **Easy to Use**: Simple command palette interface
2. **Visual Feedback**: See current settings at a glance
3. **Flexible**: Reset to default at any time
4. **Persistent**: Settings saved across sessions
5. **Multiple Options**: Configure via UI or directly in settings.json
