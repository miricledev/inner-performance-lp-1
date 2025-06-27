# SimplyBook.me API Integration Fixes

## Problem Summary

The availability checking system was incorrectly showing available slots for coaches Mason (unit ID 4) and Josh (unit ID 10) even when they were already booked. This was caused by improper cross-referencing between theoretical availability and actual reserved time intervals.

## Root Cause Analysis

### 1. **Missing Data Cross-Reference**
- `getStartTimeMatrix()` returns theoretical availability based on working schedules
- `getReservedTimeIntervals()` returns actual bookings and reserved times
- The original code wasn't properly filtering out booked slots

### 2. **Incorrect Data Structure Parsing**
- The API returns `intervalGroup.events` for reserved time intervals, not `intervalGroup.intervals`
- The overlap detection logic was flawed

### 3. **Incomplete Time Range Checking**
- Only checked if slot start time fell within reserved intervals
- Didn't consider the full slot duration (55 minutes) when checking for conflicts

## Fixes Implemented

### 1. **Proper Availability Filtering Algorithm**

```javascript
function isSlotAvailable(slotTime, reservedIntervals, serviceDuration = 55) {
    const slotStartMinutes = timeToMinutes(slotTime);
    const slotEndMinutes = slotStartMinutes + serviceDuration;
    
    for (const intervalGroup of reservedIntervals) {
        // Check for 'reserved_time' type with events array
        if (intervalGroup.type === 'reserved_time' && intervalGroup.events) {
            for (const event of intervalGroup.events) {
                const reservedStart = timeToMinutes(event.from);
                const reservedEnd = timeToMinutes(event.to);
                
                // Check for overlap: (slotStart < reservedEnd) && (reservedStart < slotEnd)
                if (slotStartMinutes < reservedEnd && reservedStart < slotEndMinutes) {
                    return false; // Slot conflicts with reserved time
                }
            }
        }
    }
    return true; // Slot is available
}
```

### 2. **Date Range Fix**

**Problem**: Monday availability wasn't showing because the API needed to start the range from one day before.

**Solution**: Automatically adjust the start date to be one day before the requested date:

```javascript
// Adjust start date to be one day before to ensure we capture the full day
const startDate = new Date(req.body.start_date);
startDate.setDate(startDate.getDate() - 1);
const adjustedStartDate = startDate.toISOString().split('T')[0];
```

**Why this matters:**
- If checking for Monday availability, start the range from Sunday
- This ensures SimplyBook returns complete availability for the target day
- Without this adjustment, Monday availability might be missing or incomplete

### 3. **Frontend Date Filtering**

**Critical Fix**: Since the backend now requests availability starting from one day before, the frontend must filter out the extra day to show the correct dates.

```javascript
// Get the original requested date range (without the adjustment)
const originalStartDate = weekStart.toISOString().split('T')[0];
const originalEndDate = endOfWeek.toISOString().split('T')[0];

data.result.forEach(slot => {
    const date = slot.start_time.split(' ')[0];
    
    // Only include slots within the original requested date range
    if (date >= originalStartDate && date <= originalEndDate) {
        if (!availableSlots[date]) {
            availableSlots[date] = [];
        }
        availableSlots[date].push(slot);
    }
});
```

### 4. **Corrected Booking API Format**

**Problem**: The booking API was using the wrong parameter structure for SimplyBook.me.

**Solution**: Updated to use the correct API format according to SimplyBook.me documentation:

```javascript
// Step 1: Create client first to get client ID
const clientRequest = JSON.stringify({
    jsonrpc: "2.0",
    method: "addClient",
    params: [
        {
            name: client_name,
            email: client_email,
            phone: client_phone,
            notes: client_notes || ""
        }
    ],
    id: 3
});

const clientResult = await makeAPIRequest('/admin/', clientRequest, {
    'X-Company-Login': config.companyLogin,
    'X-User-Token': adminToken
});

const clientId = clientResult.result;

// Step 2: Create the booking with client ID and client data
const clientData = {
    name: client_name,
    email: client_email,
    phone: client_phone
};

if (client_notes && client_notes.trim()) {
    clientData.notes = client_notes.trim();
}

const additionalFieldValues = {};

const bookingRequest = JSON.stringify({
    jsonrpc: "2.0",
    method: "book",
    params: [
        service_id,           // serviceId
        finalUnitId,          // performerId (unit_id)
        clientId,             // clientId (required)
        startDate,            // startDate
        startTime,            // startTime
        clientData,           // clientData object
        additionalFieldValues, // additionalFieldValues
        1                     // count
    ],
    id: 4
});
```

**Key Changes:**
- Added client creation step to get client ID
- Include client ID as the third parameter in booking request
- Keep client data object for additional information
- Added proper error handling for client creation
- Simplified the booking process with correct parameter order

## Testing the Fixes

### 1. **Debug Endpoint**

Use the new debug endpoint to test availability checking:

```bash
# Test Mason's availability for a specific date
curl "http://localhost:3000/api/debug-availability?date=2024-12-02&unit_id=4&service_id=13"

# Test Josh's availability for a specific date
curl "http://localhost:3000/api/debug-availability?date=2024-12-02&unit_id=10&service_id=13"
```

The debug endpoint returns:
- Raw API responses from SimplyBook
- Processed availability data
- Summary of theoretical vs actual availability
- Working hours filtered results

### 2. **Manual Testing Steps**

1. **Check Current Bookings**: Use the SimplyBook admin panel to see existing bookings for Mason and Josh
2. **Test Availability Endpoint**: Call `/api/available-slots` and verify booked times don't appear
3. **Test Booking Validation**: Try to book an already-booked slot and verify it's rejected
4. **Monitor Logs**: Check server logs for detailed availability checking information

### 3. **Expected Behavior**

**Before Fix:**
- All theoretical time slots shown as available
- Booked slots still appeared in availability list
- No validation before booking

**After Fix:**
- Only truly available slots shown
- Booked slots properly filtered out
- Pre-booking validation prevents double-booking
- Detailed logging for debugging

## Configuration

The system uses these key configuration values:

```json
{
    "serviceId": 13,
    "units": {
        "Mason": 4,
        "Josh": 10
    },
    "workingHours": {
        "start": 16,
        "end": 18,
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    },
    "serviceDuration": 55
}
```

## Expected Slot Times

For 55-minute sessions with working hours 4-6 PM, the system will now correctly show:

**Available Slots:**
- **4:00 PM - 4:55 PM** (55 minutes)
- **5:00 PM - 5:55 PM** (55 minutes)

**Slots That Will Be Filtered Out:**
- 4:30 PM (would end at 5:25 PM, too close to 5:00 PM slot)
- 5:30 PM (would end at 6:25 PM, beyond working hours)

This ensures proper spacing between sessions and adherence to working hours.

## API Endpoints

### 1. **Get Available Slots**
```
POST /api/available-slots
Content-Type: application/json

{
    "start_date": "2024-12-02",
    "end_date": "2024-12-06",
    "service_id": 13
}
```

### 2. **Debug Availability**
```
GET /api/debug-availability?date=2024-12-02&unit_id=4&service_id=13
```

### 3. **Book Session**
```
POST /api/book-session
Content-Type: application/json

{
    "start_time": "2024-12-02 16:00:00",
    "service_id": 13,
    "unit_id": 4,
    "client_name": "John Doe",
    "client_email": "john@example.com",
    "client_phone": "123-456-7890"
}
```

## Monitoring and Debugging

### 1. **Server Logs**
The system provides detailed logging for:
- API token retrieval
- Time matrix responses
- Reserved intervals data
- Availability filtering decisions
- Booking validation results

### 2. **Error Handling**
- Graceful handling of API failures
- Clear error messages for clients
- Fallback behavior when validation fails

### 3. **Performance Considerations**
- Tokens are cached and reused
- API calls are optimized to minimize requests
- Validation happens only when necessary

## Troubleshooting

### Common Issues:

1. **"No reserved data" messages**: Normal when coaches have no bookings
2. **Token expiration errors**: Tokens auto-refresh every 55 minutes
3. **API rate limits**: Implemented proper error handling and retries

### Debug Commands:

```bash
# Check server logs
tail -f server.log

# Test specific coach availability
curl -X POST http://localhost:3000/api/available-slots \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2024-12-02","end_date":"2024-12-02","service_id":13}'

# Debug specific date/coach combination
curl "http://localhost:3000/api/debug-availability?date=2024-12-02&unit_id=4&service_id=13"
```

## Future Improvements

1. **Caching**: Implement Redis caching for availability data
2. **Webhooks**: Add SimplyBook webhook support for real-time updates
3. **Rate Limiting**: Add client-side rate limiting for API calls
4. **Monitoring**: Add metrics and alerting for API failures

## Support

For issues or questions:
1. Check server logs for detailed error information
2. Use the debug endpoint to isolate problems
3. Verify SimplyBook API credentials and permissions
4. Test with the debug endpoint before reporting issues 