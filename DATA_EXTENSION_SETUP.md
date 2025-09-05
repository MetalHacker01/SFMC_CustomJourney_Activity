# Data Extension Setup Guide

This document outlines the data extensions needed for the custom journey activity, following patterns from the trigger-journey-activity example.

## Required Data Extensions

### 1. Main Data Extension (Master_Subscriber)
This is your main data extension where the custom message will be written.

**External Key:** `3010F472-DE73-4A74-BB75-5FD96D878E75`
**Name:** `Master_Subscriber`

**Required Fields:**
- `SubscriberKey` (Text, Primary Key, Required)
- `CustomText` (Text, 500 characters) - This field will be updated by the activity

### 2. Activity Execution Log Data Extension (Optional but Recommended)
This data extension logs all activity executions for monitoring and debugging, similar to how the example uses PostgreSQL.

**External Key:** `CustomActivity_Log`
**Name:** `Custom_Activity_Execution_Log`

**Required Fields:**
- `SubscriberKey` (Text, Required) - The contact's subscriber key
- `ActivityUUID` (Text, Required) - Unique identifier for each activity execution
- `ExecutionDate` (Date, Required) - When the activity was executed
- `Status` (Text, Required) - Success/Error status
- `CustomMessage` (Text, 500 characters) - The message that was written
- `ErrorLog` (Text, 1000 characters) - Error details if execution failed

## Environment Variables

Set these in your `.env` file:

```env
# Main Data Extension (Required)
DE_EXTERNAL_KEY=3010F472-DE73-4A74-BB75-5FD96D878E75
DE_NAME=Master_Subscriber

# Activity Log Data Extension (Optional)
ACTIVITY_LOG_DE_KEY=CustomActivity_Log
ACTIVITY_LOG_DE_NAME=Custom_Activity_Execution_Log
```

## Data Extension Creation SQL

If you need to create the log data extension, use this SQL in SFMC:

```sql
-- Create the activity log data extension
CREATE TABLE Custom_Activity_Execution_Log (
    SubscriberKey VARCHAR(255) NOT NULL,
    ActivityUUID VARCHAR(50) NOT NULL,
    ExecutionDate DATETIME NOT NULL,
    Status VARCHAR(50) NOT NULL,
    CustomMessage VARCHAR(500),
    ErrorLog VARCHAR(1000)
)
```

## How It Works

1. **Configuration Phase:** User configures the custom message in Journey Builder
2. **Execution Phase:** When a contact enters the activity:
   - The custom message is written to the `CustomText` field in the main data extension
   - Execution details are logged to the activity log data extension (if configured)
   - Both operations use the contact's `SubscriberKey` as the identifier

## Monitoring Activity Executions

You can query activity executions by UUID:
```
GET /activity/{uuid}
```

This returns all execution records for a specific activity instance, useful for debugging and monitoring.

## Error Handling

The activity follows a fault-tolerant pattern:
- If the main data extension update fails, the error is logged but the journey continues
- If logging fails, it doesn't affect the main operation
- All errors are captured and can be reviewed in the execution logs

This approach ensures that journey execution is never blocked by the custom activity, following SFMC best practices.