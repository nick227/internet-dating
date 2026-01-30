# API Routes Summary

This document provides a comprehensive overview of all available API routes in the internet-dating.com backend.

## Base URL
All API routes are prefixed with `/api`

## Authentication Levels
- **Public**: No authentication required
- **User**: Requires valid user authentication
- **Admin**: Requires admin privileges

---

## System Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/meta` | Public | API metadata (name, version) |

---

## Authentication Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | Public | Create user and issue auth cookies |
| POST | `/auth/login` | Public | Verify credentials and issue auth cookies |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | User | Clear auth cookies |
| GET | `/auth/me` | User | Return current user ID and role |

---

## Admin Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | Admin | Get users list with details (searchable, sortable) |
| GET | `/admin/jobs/history` | Admin | Get job run history |
| GET | `/admin/jobs/active` | Admin | Get active job runs |
| GET | `/admin/jobs/stats` | Admin | Get job statistics |
| POST | `/admin/jobs/enqueue` | Admin | Enqueue a job for execution |
| POST | `/admin/jobs/:jobRunId/cancel` | Admin | Request job cancellation |
| GET | `/admin/jobs/:jobRunId` | Admin | Get job run details |
| GET | `/admin/jobs/:jobRunId/logs` | Admin | Get job run logs |
| GET | `/admin/jobs/:jobRunId/progress` | Admin | Get job run progress |
| GET | `/admin/jobs/:jobRunId/outcome` | Admin | Get job run outcome summary |
| GET | `/admin/jobs/definitions` | Admin | Get available job definitions |
| POST | `/admin/jobs/enqueue-all` | Admin | Enqueue all jobs in dependency order |
| POST | `/admin/jobs/enqueue-group` | Admin | Enqueue all jobs in a specific group |
| POST | `/admin/jobs/cleanup-stalled` | Admin | Clean up stalled/orphaned jobs |
| GET | `/admin/worker/status` | Admin | Get worker status and health |
| POST | `/admin/worker/start` | Admin | Start the job worker |
| POST | `/admin/worker/stop` | Admin | Stop the job worker |
| GET | `/admin/daemon/status` | Admin | Get schedule daemon status and health |
| GET | `/admin/schedules` | Admin | List all job schedules |
| GET | `/admin/schedules/:id` | Admin | Get schedule details |
| PUT | `/admin/schedules/:id` | Admin | Update schedule (enable/disable) |
| POST | `/admin/schedules/:id/trigger` | Admin | Manually trigger schedule (run now) |
| GET | `/admin/schedules/:id/history` | Admin | Get schedule run history |

---

## Feed Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/feed` | Public | Homepage feed (posts + match suggestions) |
| POST | `/posts` | User | Create post |
| PATCH | `/posts/:postId` | User | Update post |
| DELETE | `/posts/:postId` | User | Delete post |
| DELETE | `/posts/:postId/media/:mediaId` | User | Remove media from post |
| POST | `/posts/:postId/save` | User | Save post (like) |

---

## Comments Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/comments` | User | Create comment |
| GET | `/comments` | Public | List comments for a post |
| GET | `/comments/:commentId/replies` | Public | Get replies for a comment |
| POST | `/comments/:commentId/like` | User | Like or unlike a comment |
| DELETE | `/comments/:commentId` | User | Delete a comment |
| PATCH | `/comments/:commentId` | User | Edit a comment |

---

## Profiles Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profiles/recommendations` | User | Get profile recommendations |
| GET | `/profiles/search` | Public | Search profiles |
| POST | `/profiles/search/advanced` | Public | Advanced profile search |
| GET | `/profiles/traits` | Public | Get available profile traits |
| POST | `/profiles/location/reverse-geocode` | User | Reverse geocode location |
| GET | `/profiles/:userId` | Public | Get profile |
| POST | `/profiles/:userId/access/request` | User | Request profile access |
| POST | `/profiles/:userId/access/grant` | User | Grant profile access |
| GET | `/profiles/:userId/followers` | Public | Get profile followers |
| GET | `/profiles/:userId/following` | Public | Get profile following |
| POST | `/profiles/:userId/access/approve` | User | Approve access request |
| POST | `/profiles/:userId/access/deny` | User | Deny access request |
| POST | `/profiles/:userId/access/cancel` | User | Cancel access request |
| POST | `/profiles/:userId/access/revoke` | User | Revoke profile access |
| PATCH | `/profiles/:userId` | User | Update profile |
| POST | `/profiles/:userId/rate` | User | Rate profile |

---

## Matches Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/likes` | User | Like/dislike/unlike user |
| GET | `/likes` | User | List likes (profiles you liked, not yet matched) |
| GET | `/matches` | User | List matches |
| GET | `/suggestions` | User | List match suggestions |

---

## Messaging Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/conversations/with/:userId` | User | Get or create conversation with user |
| GET | `/inbox` | User | Inbox conversations |
| GET | `/conversations/:conversationId` | User | Get conversation messages |
| POST | `/conversations/:conversationId/delete` | User | Delete conversation for current user |
| POST | `/conversations/:conversationId/messages` | User | Send message |
| POST | `/messages/:messageId/read` | User | Mark message as read |

---

## Quizzes Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/quizzes/active` | Public | Get active quiz |
| GET | `/quizzes/tags` | Public | List quiz tags |
| GET | `/quizzes/:quizId` | Public | Get quiz by ID |
| GET | `/quizzes` | Public | List quizzes |
| POST | `/quizzes/:quizId/submit` | User | Submit quiz answers |
| PATCH | `/quizzes/:quizId` | User | Update quiz (editor only) |
| PATCH | `/quizzes/:quizId/questions/:questionId` | User | Update quiz question (editor only) |
| PATCH | `/quizzes/:quizId/questions/:questionId/options/:optionId` | User | Update quiz option (editor only) |
| GET | `/quizzes/:quizId/results` | User | Get quiz results with demographic comparisons |

---

## Safety Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/users/:userId/block` | User | Block user |
| POST | `/users/:userId/report` | User | Report user |

---

## Media Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/media/upload` | User | Upload media (streaming, up to 200MB) |
| GET | `/media/:mediaId` | Public | Get media metadata |
| DELETE | `/media/:mediaId` | User | Delete media |

---

## Interests Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/interests/subjects` | Public | List all interest subjects |
| GET | `/interests` | Public | List interests with pagination |
| GET | `/interests/my` | User | Get user's selected interests |
| POST | `/interests/:interestId/select` | User | Add interest to user |
| DELETE | `/interests/:interestId/select` | User | Remove interest from user |
| POST | `/interests/search` | User | Search interests from text |

---

## Science Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/science/match-spectrum` | Admin | Get sampled match pairs with live explanations |
| GET | `/science/interests` | Admin | Get interest relationship data |
| GET | `/science/stats` | Admin | Get platform statistics |

---

## Static Routes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Health check |
| GET | `/health/db` | Public | Database health check |
| GET | `/media/*` | Public | Serve media files |
| GET | `/test-root` | Public | Test route |
| GET | `/test-media-config` | Public | Test media configuration |

---

## WebSocket Events
The backend also supports WebSocket connections for real-time features:
- **Messenger**: Real-time messaging and read receipts
- **Presence**: User online/offline status
- **Admin**: Administrative notifications

## Rate Limiting
- Search endpoints have rate limiting applied
- Media uploads have size and time limits
- General API endpoints may have rate limiting

## Notes
- All datetime fields are returned in ISO 8601 format
- IDs are returned as strings for JSON compatibility
- Pagination uses cursor-based pagination where applicable
- Media files are served separately via `/media/*` routes
- The API supports CORS for frontend integration