# AGENTS.md

## Project Overview

This is a VS Code extension that provides a GitHub Copilot Chat provider for the Synthetic API. It acts as a bridge between VS Code's Language Model Chat API and Synthetic's OpenAI-compatible API, enabling users to use Synthetic's language models directly within GitHub Copilot Chat in VS Code.

**Key Technologies**: TypeScript, VS Code Extension API, OpenAI SDK, Zod validation, Tiktoken

**Main Components**:
- `src/extension.ts` - Extension entry point and command registration
- `src/provider.ts` - Core chat provider implementation
- `src/syntheticModels.ts` - Synthetic API integration and model management
- `src/config.ts` - Configuration management (API keys, temperatures)
- `src/utils.ts` - API conversion utilities (VS Code ↔ OpenAI)
- `src/thinkParser.ts` - Thinking tags parsing for reasoning content
- `src/types.ts` - TypeScript definitions and Zod schemas

## Development Environment Setup

### Prerequisites
- Node.js 18+ (check with `node --version`)
- VS Code Extension Development environment
- npm (comes with Node.js)

### Installation & Build Commands
```bash
# Install dependencies
npm install

# Compile TypeScript (required before running tests or packaging)
npm run compile

# Watch mode for development (auto-compiles on file changes)
npm run watch

# Lint code
npm run lint

# Format code
npm run format

# Run tests
npm run test

# Package extension for distribution
npm run package
```

### VS Code Tasks Available
The following tasks are configured and can be run via VS Code command palette:
- `npm: watch` - Watch mode compilation
- `npm: watch-tests` - Watch mode testing
- `tasks: watch-tests` - Combined watch mode for both compilation and testing

## Code Style Guidelines

**TypeScript Configuration**: Strict mode enabled with comprehensive type checking
- `tsconfig.json` enables all strict type-checking options
- Target: ES2024, Module: Node16
- Source maps enabled for debugging

**ESLint Rules** (see `eslint.config.mjs`):
- Semi-colons required
- Curly braces required for all control structures
- Unused parameters allowed (ignore pattern: `^_`)
- Import formatting: camelCase and PascalCase
- TypeScript ESLint recommended rules enabled
- Stylistic rules from `@stylistic/eslint-plugin`

**Formatting**: Prettier with default settings

## Testing Strategy

**Test Framework**: Mocha with TypeScript support
**Test Location**: `src/test/` directory with corresponding `.test.ts` files

**Test Coverage**:
- `config.test.ts` - Configuration management tests
- `provider.test.ts` - Message conversion and token counting tests
- Additional test files for other modules

**Test Commands**:
```bash
# Run all tests (includes compilation)
npm run test

# Run tests in watch mode during development
npm run watch-tests
```

## Architecture Patterns

### Provider Pattern
The `SyntheticChatModelProvider` implements `LanguageModelChatProvider` interface:
- Handles chat requests and streaming responses
- Manages API authentication and model fetching
- Converts between VS Code and OpenAI API formats

### Service Layer
- `SyntheticModelsService` handles all Synthetic API interactions
- Caches model details from external APIs
- Provides fallback mechanisms for API failures

### Configuration Management
- API keys stored in VS Code SecretStorage
- Model temperatures in VS Code workspace configuration
- UI commands for user configuration

### Validation with Zod
- API response validation using Zod schemas
- Runtime type safety for external API data
- Error handling for invalid responses

## API Integration Details

**Synthetic API Endpoints**:
- Models list: `https://api.synthetic.new/openai/v1/models`
- Model details: `https://models.dev/api.json`

**OpenAI SDK Configuration**:
- Custom base URL for Synthetic API
- Streaming responses enabled
- User-Agent header for analytics

**Error Handling**:
- User-friendly error messages for API failures
- Graceful degradation when external APIs are unavailable
- Cancellation token support for long-running requests

## Common Development Tasks

### Adding New Features
1. Add TypeScript types to `src/types.ts` if needed
2. Implement logic in appropriate module (provider, config, utils, etc.)
3. Add tests in corresponding `.test.ts` file
4. Update `package.json` commands/contributions if needed
5. Run `npm run lint` and `npm run test` to verify changes

### Modifying API Integration
- Synthetic API calls are in `syntheticModels.ts`
- OpenAI conversion logic is in `utils.ts`
- Error handling should include user notifications
- Always validate API responses using existing Zod schemas

### Testing Changes
```bash
# Run tests after any changes
npm run test

# Watch mode during development
npm run watch-tests

# Lint to catch style issues
npm run lint
```

## Security Considerations

**API Key Management**:
- Never log or expose API keys
- Store in VS Code SecretStorage, never in code or config files
- Clear keys when extension is disabled

**Network Security**:
- All API calls use HTTPS
- Validate all external API responses
- Handle network failures gracefully

**User Data**:
- Chat messages are sent to Synthetic API
- No message content is logged locally
- Respect VS Code privacy settings

## Extension Packaging & Distribution

**Package Command**: `npm run package` creates `synthetic-copilot-provider.vsix`

**Installation Methods**:
1. VS Code: Extensions > Install from VSIX
2. Command line: `code --install-extension synthetic-copilot-provider.vsix`
3. VS Code Marketplace (when published)

**Extension Manifest**: Check `package.json` for:
- Activation events: `onLanguageModelChat:synthetic`
- Commands contributed: `synthetic.manage`, `synthetic.configureTemperature`
- Configuration schema for temperature settings

## Troubleshooting Common Issues

**Build Errors**:
- Run `npm run compile` to see detailed TypeScript errors
- Check `tsconfig.json` for configuration issues
- Ensure all imports match file paths exactly

**Test Failures**:
- Check VS Code API mock implementations in tests
- Verify test file names match pattern `*.test.ts`
- Run tests individually to isolate issues

**Extension Not Loading**:
- Verify `main` field in `package.json` points to compiled `out/extension.js`
- Check activation events are correctly defined
- Review VS Code developer console for errors

**API Integration Issues**:
- Verify API key is correctly configured
- Check network connectivity to Synthetic API
- Review model availability and permissions

## Pull Request Guidelines

**Before Submitting**:
1. Run `npm run lint` to check code style
2. Run `npm run test` to ensure all tests pass
3. Run `npm run compile` to verify TypeScript compilation
4. Test the extension manually by installing the VSIX

**Code Changes**:
- Follow existing TypeScript patterns and conventions
- Add tests for new functionality
- Update type definitions if adding new features
- Include error handling for new code paths

**Documentation**:
- Update AGENTS.md for significant architectural changes
- Keep README.md updated for user-facing changes
- Add inline comments for complex logic

## Dependencies Management

**Production Dependencies**:
- `openai` - OpenAI SDK for API calls
- `tiktoken` - Token counting utilities
- `zod` - Schema validation
- `vsce` - Extension packaging

**Development Dependencies**:
- TypeScript, ESLint, Prettier for development tools
- VS Code testing and type definitions
- Mocha for test framework

**Adding New Dependencies**:
```bash
npm install <package-name>
npm install --save-dev <dev-package-name>
```

Always update dependencies carefully and test thoroughly after changes.