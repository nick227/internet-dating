# Job Manager - User Guide

> **New to the Job Manager?** This guide explains what each job does in plain language.

---

## What Are Jobs?

**Jobs** are automated tasks that keep your dating platform running smoothly. They update match scores, organize feeds, clean up old data, and more.

**Think of them as maintenance crews** - each one has a specific job to do to keep everything working great for your users.

---

## How Jobs Work

### 🔄 **Automatic vs. Manual**

- **Automatic (Scheduled)** - Most jobs run automatically on a schedule
- **Manual** - You can also run jobs manually from the admin panel when needed

### 📊 **Job Status**

- **Queued** - Waiting to run
- **Running** - Currently processing
- **Success** - Completed successfully
- **Failed** - Something went wrong (check error details)
- **Cancelled** - Stopped by admin

---

## Job Groups Explained

### 💝 **Matching** - Finding Compatible Users

These jobs help users find their perfect match.

#### **build-user-traits**
> Analyzes quiz answers to understand each user's personality

**What it does:** Looks at how users answered personality quiz questions and creates a personality profile for them.

**When to run:** After users complete quizzes, or when you update the quiz algorithm.

**Impact:** Better match recommendations for everyone.

---

#### **match-scores**
> Calculates compatibility between users

**What it does:** Compares users' personality traits, preferences, and interests to score how compatible they are (0-100%).

**When to run:** After building user traits, or when you want to refresh match recommendations.

**Impact:** Users see updated match percentages and recommendations.

---

#### **compatibility**
> Creates detailed compatibility reports

**What it does:** Goes deeper than match scores - analyzes specific areas of compatibility (communication style, lifestyle, values, etc.).

**When to run:** Alongside match scores for complete compatibility analysis.

**Impact:** Users get detailed "why you match" explanations.

---

### 📰 **Feed** - Keeping Content Fresh

These jobs power the personalized feed each user sees.

#### **content-features**
> Analyzes posts to understand their content

**What it does:** Reads posts to figure out what topics they're about, extracts hashtags, and identifies themes.

**When to run:** Automatically after new posts are created, or to analyze older posts.

**Impact:** Better content recommendations in user feeds.

---

#### **trending**
> Identifies popular content

**What it does:** Calculates which posts are getting the most engagement (likes, comments, shares) right now.

**When to run:** Regularly (every few hours) to keep trending content fresh.

**Impact:** Users see what's hot in the community.

---

#### **affinity**
> Learns what each user likes

**What it does:** Tracks which posts, topics, and creators each user engages with to understand their preferences.

**When to run:** Daily or weekly to update user preferences.

**Impact:** Feeds become more personalized over time.

---

#### **feed-presort**
> Pre-organizes each user's feed

**What it does:** Creates personalized feed sections for each user based on their matches, interests, and affinities.

**When to run:** After match scores and affinity updates.

**Impact:** Users see a perfectly organized feed when they open the app.

---

### 🔍 **Search** - Finding People Fast

These jobs make profile searching quick and accurate.

#### **profile-search-index**
> Builds searchable user profiles

**What it does:** Creates a fast search index of all user profiles (like a phone book for your app).

**When to run:** When user profiles change significantly, or to rebuild the index.

**Impact:** Profile search works faster and shows more relevant results.

---

#### **user-interest-sets**
> Organizes users by interests

**What it does:** Groups users by shared interests (e.g., all users who like "hiking" or "photography").

**When to run:** After users update their interests.

**Impact:** "Find people who like X" searches work better.

---

#### **searchable-user**
> Updates search-friendly profile snapshots

**What it does:** Creates simplified versions of profiles optimized for search (removes private info, adds search keywords).

**When to run:** After profile updates or trait building.

**Impact:** Search results are more accurate and respect privacy settings.

---

#### **interest-relationships**
> Finds related interests

**What it does:** Discovers which interests often go together (e.g., users who like "yoga" often also like "meditation").

**When to run:** Weekly or when interests change significantly.

**Impact:** Better interest suggestions and search recommendations.

---

### 🧹 **Maintenance** - Keeping Things Clean

These jobs clean up and fix data automatically.

#### **stats-reconcile**
> Fixes counting errors

**What it does:** Recalculates counters (follower counts, like counts, etc.) to make sure they're accurate.

**When to run:** Daily or weekly to keep stats accurate.

**Impact:** Correct numbers throughout the app.

---

#### **media-orphan-cleanup**
> Removes abandoned files

**What it does:** Finds uploaded images/videos that were never attached to posts or profiles and deletes them.

**When to run:** Daily to save storage space.

**Impact:** Reduced storage costs, faster backups.

---

#### **feed-presort-cleanup**
> Clears old feed cache

**What it does:** Deletes pre-sorted feed data that's too old to be useful anymore.

**When to run:** Daily to keep the database lean.

**Impact:** Faster database queries, reduced storage.

---

### 📸 **Media** - Processing Photos & Videos

These jobs handle uploaded media files.

#### **media-metadata**
> Extracts file information

**What it does:** Analyzes a single uploaded video/photo to get its duration, resolution, and file size.

**When to run:** Automatically after each upload.

**Impact:** Videos show correct duration, photos display properly.

---

#### **media-metadata-batch**
> Processes multiple files at once

**What it does:** Same as above, but for many files at once (useful for backfilling old uploads).

**When to run:** When you need to process old media files or after system updates.

**Impact:** All media has correct metadata.

---

### 📝 **Quiz** - Understanding User Data

These jobs analyze quiz responses.

#### **quiz-answer-stats**
> Aggregates quiz data

**What it does:** Counts how many users chose each quiz answer, broken down by age, gender, location, etc.

**When to run:** After new quiz submissions or when you want updated statistics.

**Impact:** Better insights into your user base.

---

## Common Questions

### **How often should I run jobs manually?**

Most jobs run automatically. Only run manually if:
- You just launched and need to populate data
- You changed an algorithm and want to see results immediately
- A job failed and you want to retry it
- You're testing a new feature

### **What's the difference between "Run New Job" and "Bulk Enqueue"?**

- **Run New Job** - Run one specific job with custom settings
- **Bulk Enqueue** - Run multiple related jobs in the correct order automatically

### **What happens if a job fails?**

1. The job stops processing
2. An error message is saved
3. No user data is corrupted (jobs are safe to retry)
4. You can view the error in Job History
5. You can re-run the job when ready

### **Can I cancel a running job?**

Yes! Click the **Cancel** button on any running job. It will stop safely at the next opportunity.

### **Will running jobs slow down my app?**

Jobs are designed to run in the background with minimal impact. They:
- Process data in small batches
- Pause between batches
- Use background workers
- Don't block user requests

### **How long do jobs take?**

It depends on how much data you have:

| Database Size | Typical Job Duration |
|---------------|---------------------|
| Small (< 1K users) | 1-5 minutes |
| Medium (1K-10K users) | 5-30 minutes |
| Large (10K-100K users) | 30 min - 2 hours |
| Very Large (100K+ users) | 2-6 hours |

---

## Recommended Job Schedule

### **Daily (Every Night at 3 AM)**
```
✅ Maintenance Group
  - stats-reconcile
  - media-orphan-cleanup
  - feed-presort-cleanup

✅ Feed Group
  - content-features
  - trending
  - affinity
  - feed-presort
```

### **Weekly (Sunday Night)**
```
✅ Search Group
  - profile-search-index
  - user-interest-sets
  - searchable-user
  - interest-relationships

✅ Matching Group (if quiz algorithm changed)
  - build-user-traits
  - match-scores
  - compatibility
```

### **As Needed**
```
✅ media-metadata-batch (after bulk uploads)
✅ quiz-answer-stats (after quiz updates)
```

---

## Bulk Enqueue Guide

**What is Bulk Enqueue?**

Instead of running jobs one-by-one, you can run entire groups with one click. The system automatically:
1. Figures out which jobs depend on others
2. Runs them in the correct order
3. Includes cross-group dependencies automatically

**Example: Enqueue "Feed" Group**

When you enqueue the **feed** group, the system automatically includes:
- All 4 feed jobs (content-features, trending, affinity, feed-presort)
- Required dependencies from other groups (build-user-traits, match-scores)
- Runs them in the correct order: traits → scores → content → trending → affinity → presort

**When to Use Bulk Enqueue:**
- ✅ After launching your app (run "All Jobs" once)
- ✅ After major algorithm updates (run affected group)
- ✅ During scheduled maintenance (run maintenance group)
- ✅ When users report stale content (run feed group)

---

## Troubleshooting

### **Job shows "Failed"**

1. Click the job to see error details
2. Common causes:
   - Database was temporarily unavailable → Retry
   - Invalid parameters → Fix parameters and re-run
   - Data integrity issue → Check related data
3. If unsure, re-run with default parameters

### **Job stuck "Running" for hours**

1. Check if job is actually stalled (no progress updates)
2. Click **Cancel** to stop it safely
3. Check the "Stalled Jobs" warning banner
4. Click **Cleanup Stalled Jobs** if needed
5. Re-run the job

### **Matches seem outdated**

Run the **matching** group:
```
1. Click "Bulk Enqueue"
2. Select "Enqueue Job Group"
3. Choose "matching"
4. Click "Enqueue Jobs"
```

This will refresh all user traits and match scores.

### **Feed not updating**

Run the **feed** group:
```
1. Click "Bulk Enqueue"
2. Select "Enqueue Job Group"
3. Choose "feed"
4. Click "Enqueue Jobs"
```

This will refresh trending content, user affinities, and presorted feeds.

---

## Getting Help

**Still confused?** That's okay!

1. **Hover over any job name** in the UI to see a quick description
2. **Check the Job History** to see what jobs typically do
3. **Start with "Bulk Enqueue → Enqueue All Jobs"** if you're setting up for the first time
4. **Contact support** if jobs repeatedly fail

---

## Quick Start Checklist

**First Time Setup:**

```
☐ 1. Go to /admin/jobs
☐ 2. Click "Bulk Enqueue"
☐ 3. Select "Enqueue All Jobs"
☐ 4. Click "Enqueue Jobs"
☐ 5. Wait for all jobs to complete (check Active Jobs section)
☐ 6. Verify user profiles, matches, and feeds look good
☐ 7. Set up automatic daily/weekly runs (see Recommended Schedule above)
```

**That's it!** Your job system is now running and keeping your app up-to-date automatically.

---

## Summary

**Remember:**
- Jobs are automated maintenance tasks
- Most run automatically (you don't need to do anything)
- Use "Bulk Enqueue" to run groups of related jobs
- Jobs are safe to re-run if they fail
- Check Job History to monitor progress

**You're ready!** 🎉
