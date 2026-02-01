# Agent Chat Migration - Implementation Tasks

**Change**: agent-chat-migration
**Status**: Ready for Implementation
**Estimated Duration**: 3 weeks
**Dependencies**: Completed proposal, design, and specs

---

## 1. Project Setup and Dependencies

- [ ] 1.1 Add Python dependencies to pyproject.toml (duckduckgo-search, beautifulsoup4, trafilatura, httpx)
- [ ] 1.2 Add optional Google API dependency (google-api-python-client)
- [ ] 1.3 Run poetry install to install new dependencies
- [ ] 1.4 Create backend/uteki/domains/agent/research/ directory structure
- [ ] 1.5 Add __init__.py files to research module
- [ ] 1.6 Add environment variables to .env.example (GOOGLE_CUSTOM_SEARCH_API_KEY, DEFAULT_SEARCH_ENGINE, etc.)

---

## 2. Backend - Search Engine Abstraction

- [ ] 2.1 Create backend/uteki/domains/agent/research/schemas.py with SearchResult, ScrapedContent models
- [ ] 2.2 Implement GoogleSearchStrategy class in search_engine.py
- [ ] 2.3 Implement DuckDuckGoSearchStrategy class in search_engine.py
- [ ] 2.4 Implement SearchEngine factory class with strategy pattern
- [ ] 2.5 Add search result deduplication logic
- [ ] 2.6 Add aggregate_sources() method for domain statistics
- [ ] 2.7 Write unit tests for SearchEngine (mock Google/DuckDuckGo responses)
- [ ] 2.8 Test Google API with real credentials (if available)
- [ ] 2.9 Test DuckDuckGo fallback mechanism
- [ ] 2.10 Add logging for search operations

---

## 3. Backend - Web Content Extraction

- [ ] 3.1 Create backend/uteki/domains/agent/research/web_scraper.py
- [ ] 3.2 Implement HTTP fetching with custom User-Agent and timeout
- [ ] 3.3 Implement Trafilatura extraction strategy
- [ ] 3.4 Implement BeautifulSoup fallback strategy
- [ ] 3.5 Add content cleaning and normalization (whitespace, HTML entities)
- [ ] 3.6 Add content length limiting (MAX_CONTENT_LENGTH)
- [ ] 3.7 Implement concurrent scraping with asyncio
- [ ] 3.8 Add error handling for timeouts, SSL errors, encoding errors
- [ ] 3.9 Write unit tests for WebScraper (mock HTTP responses)
- [ ] 3.10 Test scraping with various real websites
- [ ] 3.11 Add logging for scraping operations

---

## 4. Backend - Deep Research Orchestrator

- [ ] 4.1 Create backend/uteki/domains/agent/research/orchestrator.py
- [ ] 4.2 Implement DeepResearchOrchestrator class initialization
- [ ] 4.3 Implement _decompose_query() method (LLM-based query decomposition)
- [ ] 4.4 Implement research_stream() async generator
- [ ] 4.5 Add SSE event emission for 'research_start'
- [ ] 4.6 Add SSE event emission for 'thought' (query decomposition)
- [ ] 4.7 Add SSE event emission for 'status' updates
- [ ] 4.8 Add SSE event emission for 'plan_created'
- [ ] 4.9 Add SSE event emission for 'sources_update' (real-time search progress)
- [ ] 4.10 Add SSE event emission for 'sources_complete' (with full URL list)
- [ ] 4.11 Add SSE event emission for 'source_read' (scraping progress)
- [ ] 4.12 Add SSE event emission for 'content_chunk' (streaming LLM response)
- [ ] 4.13 Add SSE event emission for 'research_complete'
- [ ] 4.14 Add error handling with 'error' event emission
- [ ] 4.15 Implement content synthesis with LLM (using existing adapter)
- [ ] 4.16 Add integration tests for full research flow

---

## 5. Backend - API Endpoint

- [ ] 5.1 Create POST /api/research/stream endpoint in api.py
- [ ] 5.2 Add ResearchRequest Pydantic schema (query, max_sources, max_scrape)
- [ ] 5.3 Implement SSE StreamingResponse
- [ ] 5.4 Add proper SSE headers (Cache-Control, Connection, X-Accel-Buffering)
- [ ] 5.5 Test endpoint with Postman/curl
- [ ] 5.6 Add API documentation (docstring)
- [ ] 5.7 Add health check endpoint /api/research/health

---

## 6. Backend - Database Schema

- [ ] 6.1 Create Alembic migration for research_data column
- [ ] 6.2 Add research_data JSONB column to agent.chat_messages table
- [ ] 6.3 Update ChatMessage model in models.py to include research_data field
- [ ] 6.4 Update ChatMessageResponse schema to include research_data
- [ ] 6.5 Run migration on development database
- [ ] 6.6 Test storing and retrieving research_data

---

## 7. Backend - Data Migration Script

- [ ] 7.1 Create scripts/migrate_chat_history.py
- [ ] 7.2 Implement SQLite connection logic
- [ ] 7.3 Implement PostgreSQL connection logic
- [ ] 7.4 Add --dry-run flag support
- [ ] 7.5 Implement conversation migration logic (batch processing)
- [ ] 7.6 Implement message migration logic (with research_data extraction)
- [ ] 7.7 Add progress tracking and display
- [ ] 7.8 Add data integrity validation (record counts, foreign keys)
- [ ] 7.9 Add error handling and rollback logic
- [ ] 7.10 Create backup of SQLite database before migration
- [ ] 7.11 Test migration with uchu_trade SQLite backup
- [ ] 7.12 Document migration usage in README

---

## 8. Frontend - Chat Components (TypeScript Conversion)

- [ ] 8.1 Create frontend/src/components/chat/ThoughtProcessCard.tsx
- [ ] 8.2 Create frontend/src/components/chat/ResearchStatusCard.tsx
- [ ] 8.3 Create frontend/src/components/chat/SourcesList.tsx
- [ ] 8.4 Create frontend/src/components/chat/EnhancedMessage.tsx
- [ ] 8.5 Create frontend/src/components/chat/TypingIndicator.tsx
- [ ] 8.6 Create frontend/src/components/chat/ModelSelector.tsx
- [ ] 8.7 Add TypeScript interfaces for all component props
- [ ] 8.8 Convert MUI v4 styles to MUI v5 (sx prop + makeStyles)
- [ ] 8.9 Test each component in isolation
- [ ] 8.10 Create Storybook stories for all components (optional)

---

## 9. Frontend - Theme and Styles

- [ ] 9.1 Create frontend/src/styles/chat-theme.ts with dark theme palette
- [ ] 9.2 Define color constants (#212121 background, rgba overlays)
- [ ] 9.3 Define animation keyframes (@keyframes slideDown, slideUp, fadeIn)
- [ ] 9.4 Add glass morphism styles (backdrop-filter, borders)
- [ ] 9.5 Add shadow definitions for depth
- [ ] 9.6 Test theme on different browsers

---

## 10. Frontend - AgentChatPage Complete Rewrite

- [ ] 10.1 Backup current AgentChatPage.tsx
- [ ] 10.2 Create new AgentChatPage.tsx based on uchu_trade ChatAgent.js structure
- [ ] 10.3 Implement state management (messages, loading, research mode, model selection)
- [ ] 10.4 Implement empty state UI (centered title "What do you want to know today?")
- [ ] 10.5 Implement model selector (bottom-fixed icons with brand colors)
- [ ] 10.6 Implement Research button (bottom-left with search icon)
- [ ] 10.7 Implement top-right controls (History, New Conversation)
- [ ] 10.8 Implement message list with scroll-to-bottom
- [ ] 10.9 Implement input area (multiline TextField)
- [ ] 10.10 Implement send button with loading state
- [ ] 10.11 Add keyboard shortcuts (Enter to send, Shift+Enter for new line)
- [ ] 10.12 Test responsive layout (desktop, tablet, mobile)

---

## 11. Frontend - Deep Research Integration

- [ ] 11.1 Implement handleDeepResearchSend() function
- [ ] 11.2 Connect to /api/research/stream endpoint
- [ ] 11.3 Implement SSE event stream parsing
- [ ] 11.4 Handle 'research_start' event
- [ ] 11.5 Handle 'thought' event (update ThoughtProcessCard)
- [ ] 11.6 Handle 'status' event (update ResearchStatusCard)
- [ ] 11.7 Handle 'plan_created' event
- [ ] 11.8 Handle 'sources_update' event (show progress)
- [ ] 11.9 Handle 'sources_complete' event (display SourcesList)
- [ ] 11.10 Handle 'source_read' event (show current scraping)
- [ ] 11.11 Handle 'content_chunk' event (stream response)
- [ ] 11.12 Handle 'research_complete' event (hide progress)
- [ ] 11.13 Handle 'error' event (display error message)
- [ ] 11.14 Implement research cancellation (AbortController)
- [ ] 11.15 Test full research flow end-to-end

---

## 12. Frontend - Conversation History

- [ ] 12.1 Implement conversation list loading from API
- [ ] 12.2 Implement history drawer (slides from right)
- [ ] 12.3 Display conversations with titles and timestamps
- [ ] 12.4 Implement conversation selection (load messages)
- [ ] 12.5 Implement conversation deletion
- [ ] 12.6 Implement new conversation creation
- [ ] 12.7 Test history drawer interactions

---

## 13. Frontend - Message Display Enhancements

- [ ] 13.1 Implement markdown rendering with marked.js
- [ ] 13.2 Implement code syntax highlighting with highlight.js
- [ ] 13.3 Add copy-to-clipboard button for code blocks
- [ ] 13.4 Implement message animations (fadeIn, slideIn)
- [ ] 13.5 Implement user/assistant avatars
- [ ] 13.6 Test markdown edge cases (tables, nested lists, etc.)

---

## 14. Integration Testing

- [ ] 14.1 Test normal chat mode (all 4 models)
- [ ] 14.2 Test Deep Research mode with Google API
- [ ] 14.3 Test Deep Research mode with DuckDuckGo fallback
- [ ] 14.4 Test research cancellation
- [ ] 14.5 Test conversation history loading
- [ ] 14.6 Test research data persistence and retrieval
- [ ] 14.7 Test error scenarios (network failure, API errors, timeouts)
- [ ] 14.8 Test UI responsiveness (different screen sizes)
- [ ] 14.9 Test browser compatibility (Chrome, Firefox, Safari)
- [ ] 14.10 Performance test (large conversations, many messages)

---

## 15. Configuration and Documentation

- [ ] 15.1 Update .env.example with all new environment variables
- [ ] 15.2 Document Google Custom Search API setup
- [ ] 15.3 Document DuckDuckGo usage (no setup required)
- [ ] 15.4 Add README.md in research/ module
- [ ] 15.5 Add inline code comments for complex logic
- [ ] 15.6 Create user guide for Research mode
- [ ] 15.7 Add troubleshooting section (common errors)

---

## 16. Deployment Preparation

- [ ] 16.1 Run all unit tests and ensure they pass
- [ ] 16.2 Run integration tests and ensure they pass
- [ ] 16.3 Run data migration script in staging environment
- [ ] 16.4 Verify migrated data integrity
- [ ] 16.5 Update deployment scripts if needed
- [ ] 16.6 Configure environment variables in production
- [ ] 16.7 Create rollback plan documentation
- [ ] 16.8 Schedule maintenance window if needed

---

## 17. Production Deployment

- [ ] 17.1 Deploy backend to production
- [ ] 17.2 Run database migration in production
- [ ] 17.3 Deploy frontend to production
- [ ] 17.4 Verify all services are running
- [ ] 17.5 Test Research mode in production
- [ ] 17.6 Monitor error logs for first 24 hours
- [ ] 17.7 Monitor performance metrics (response times, error rates)

---

## 18. Post-Deployment

- [ ] 18.1 Gather user feedback on new UI
- [ ] 18.2 Gather user feedback on Research mode
- [ ] 18.3 Monitor Google API quota usage
- [ ] 18.4 Monitor web scraping success rates
- [ ] 18.5 Identify and fix any bugs reported
- [ ] 18.6 Create GitHub issues for future enhancements
- [ ] 18.7 Update project documentation with lessons learned

---

## Summary

**Total Tasks**: 139
**Estimated Breakdown**:
- Week 1: Tasks 1-7 (Backend foundation: ~45 tasks)
- Week 2: Tasks 8-13 (Frontend implementation: ~60 tasks)
- Week 3: Tasks 14-18 (Testing, deployment, monitoring: ~34 tasks)

**Critical Path**:
1. Backend Research module (Tasks 2-5)
2. Database migration (Tasks 6-7)
3. Frontend components (Tasks 8-9)
4. AgentChatPage rewrite (Task 10)
5. Research integration (Task 11)
6. Testing and deployment (Tasks 14-17)

**Success Criteria**:
- ✅ All 139 tasks completed
- ✅ All tests passing (unit + integration)
- ✅ Data migration successful with 100% integrity
- ✅ Research mode works with both Google and DuckDuckGo
- ✅ UI matches uchu_trade design specifications
- ✅ Production deployment stable for 7 days
