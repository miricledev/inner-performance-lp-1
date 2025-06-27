const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = 3000;

// Middleware to parse JSON
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Serve config.json securely
app.get('/config.json', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        res.json(config);
    } catch (error) {
        console.error('Error reading config:', error);
        res.status(500).json({ error: 'Unable to load configuration' });
    }
});

// Utility functions for time calculations
function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Check if a time slot is available (not conflicting with reserved or non-working times)
 * 
 * SimplyBook API Response Structure:
 * Each date in reservedIntervals contains groups with:
 * - type: "reserved" - contains reserved_time array with actual bookings
 * - type: "busy_time" - contains not_worked_time array with breaks/off-hours
 * 
 * Note: The 'intervals' field in API responses is always empty and not used for booking data.
 * Actual booking conflicts are found in reserved_time and not_worked_time arrays.
 */
function isTimeSlotFree(timeSlot, reservedIntervals, serviceDuration = 55) {
    const slotMinutes = timeToMinutes(timeSlot);
    const slotEndMinutes = slotMinutes + serviceDuration;

    // Reduced logging - only log conflicts
    for (const intervalGroup of reservedIntervals) {
        // Check for reserved_time (actual bookings)
        if (Array.isArray(intervalGroup.reserved_time)) {
            for (const interval of intervalGroup.reserved_time) {
                const reservedStart = timeToMinutes(interval.from);
                const reservedEnd = timeToMinutes(interval.to);
                if (slotMinutes < reservedEnd && reservedStart < slotEndMinutes) {
                    console.log(`❌ Slot ${timeSlot} conflicts with reserved_time ${interval.from}-${interval.to}`);
                    return false;
                }
            }
        }
        // Check for not_worked_time (breaks, off-hours, etc.)
        if (Array.isArray(intervalGroup.not_worked_time)) {
            for (const interval of intervalGroup.not_worked_time) {
                const reservedStart = timeToMinutes(interval.from);
                const reservedEnd = timeToMinutes(interval.to);
                if (slotMinutes < reservedEnd && reservedStart < slotEndMinutes) {
                    console.log(`❌ Slot ${timeSlot} conflicts with not_worked_time ${interval.from}-${interval.to}`);
                    return false;
                }
            }
        }
    }
    return true;
}


function filterAvailableSlots(timeMatrix, reservedIntervals, workingHours, serviceDuration = 55) {
    const availableSlots = [];
    
    Object.keys(timeMatrix).forEach(date => {
        const times = timeMatrix[date];
        const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        
        console.log(`🗓️ Processing ${date} (${dayOfWeek}) with ${times.length} theoretical slots`);
        
        // Check if this day is in working days
        if (!workingHours.days.includes(dayOfWeek)) {
            console.log(`⏰ ${dayOfWeek} is not a working day, skipping`);
            return;
        }
        
        const dayReserved = reservedIntervals[date] || [];
        
        // Condensed logging for reserved intervals
        const hasReservedTimes = dayReserved.some(group => 
            Array.isArray(group.reserved_time) && group.reserved_time.length > 0
        );
        const hasNotWorkedTimes = dayReserved.some(group => 
            Array.isArray(group.not_worked_time) && group.not_worked_time.length > 0
        );
        
        if (hasReservedTimes || hasNotWorkedTimes) {
            console.log(`📋 ${date}: Found reserved/not_worked times`);
        } else {
            console.log(`✅ ${date}: No reserved intervals`);
        }
        
        times.forEach(time => {
            const [timeHour, timeMinute] = time.split(':').map(Number);
            const slotTime = timeHour + (timeMinute / 60);
            
            // Check working hours
            if (slotTime >= workingHours.start && slotTime < workingHours.end) {
                // Check if slot is actually available (not booked)
                if (isTimeSlotFree(time, dayReserved, serviceDuration)) {
                    const startTime = `${date} ${time}`;
                    availableSlots.push({
                        start_time: startTime,
                        available: true
                    });
                    console.log(`✅ Available slot: ${startTime}`);
                } else {
                    console.log(`❌ Slot ${time} is already booked`);
                }
            } else {
                console.log(`⏰ Slot ${time} is outside working hours (${workingHours.start}-${workingHours.end})`);
            }
        });
    });
    
    return availableSlots;
}

// Fixed endpoint for checking availability with proper filtering
app.post('/api/available-slots', async (req, res) => {
    console.log("🔍 Received POST /api/available-slots");
    console.log("📥 Request parameters:", req.body);
    
    // Add timezone debugging
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const serverOffset = new Date().getTimezoneOffset();
    console.log(`🌍 Server timezone: ${serverTimezone} (offset: ${serverOffset} minutes)`);
    
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Step 1: Get public access token for time matrix
        const publicTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getToken",
            params: {
                company_login: config.companyLogin,
                api_key: config.apiToken
            },
            id: 1
        });
        
        console.log('🔑 Getting public token...');
        
        const publicTokenResult = await makeAPIRequest('/login', publicTokenRequest);
        
        if (publicTokenResult.error) {
            console.error('❌ Public token error:', publicTokenResult.error);
            return res.status(500).json({ error: 'Failed to get public access token' });
        }
        
        const publicToken = publicTokenResult.result;
        console.log('✅ Public access token retrieved');
        
        // Step 2: Get admin access token for reserved intervals
        const adminTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getUserToken",
            params: [
                config.companyLogin,
                config.adminUsername,
                config.adminPassword
            ],
            id: 2
        });
        
        console.log('🔑 Getting admin token...');
        
        const adminTokenResult = await makeAPIRequest('/login', adminTokenRequest);
        
        if (adminTokenResult.error) {
            console.error('❌ Admin token error:', adminTokenResult.error);
            return res.status(500).json({ error: 'Failed to get admin access token' });
        }
        
        const adminToken = adminTokenResult.result;
        console.log('✅ Admin access token retrieved');
        
        // Step 3: Process each coach separately with proper availability checking
        const allAvailableSlots = [];
        const allowedUnits = [4, 10]; // Mason and Josh only
        
        for (const unitId of allowedUnits) {
            const coachName = unitId === 4 ? 'Mason' : 'Josh';

            console.log(`\n👨‍🏫 Checking availability for ${coachName} (Unit ${unitId})`);
            
            try {
                // Get theoretical time slots
                const timeMatrixRequest = JSON.stringify({
                jsonrpc: "2.0",
                    method: "getStartTimeMatrix",
                params: [
                        req.body.start_date,
                        req.body.end_date,
                        req.body.service_id,
                        unitId,
                        1
                ],
                id: 3
            });
            
                console.log(`📅 Getting time matrix for ${coachName}...`);
                
                const timeMatrixResult = await makeAPIRequest('/', timeMatrixRequest, {
                    'X-Company-Login': config.companyLogin,
                    'X-Token': publicToken
                });
                
                if (timeMatrixResult.error) {
                    console.error(`❌ Time matrix error for ${coachName}:`, timeMatrixResult.error);
                    continue;
                }
                
                const timeMatrix = timeMatrixResult.result || {};
                console.log(`📊 Time matrix for ${coachName}:`, JSON.stringify(timeMatrix, null, 2));
                

                // Get reserved intervals (actual bookings)
                const reservedRequest = JSON.stringify({
                jsonrpc: "2.0",
                    method: "getReservedTimeIntervals",
                params: [
                        req.body.start_date,
                        req.body.end_date,
                        Number(req.body.service_id),
                        Number(unitId),
                        1
                    ],
                    id: 4
                });
                
                console.log(`🚫 Getting reserved intervals for ${coachName}...`);
                
                const reservedResult = await makeAPIRequest('/admin/', reservedRequest, {
                    'X-Company-Login': config.companyLogin,
                    'X-User-Token': adminToken
                });

                console.log("🔴 ReservedIntervals raw response:", JSON.stringify(reservedResult, null, 2));

                
                const reservedIntervals = reservedResult.result || {};
                
                // Condensed logging for reserved intervals
                const totalReservedTimes = Object.values(reservedIntervals).flat().reduce((count, group) => {
                    return count + (group.reserved_time?.length || 0) + (group.not_worked_time?.length || 0);
                }, 0);
                
                console.log(`🔒 Reserved intervals for ${coachName}: ${totalReservedTimes} total reserved/not_worked times found`);
                
                // Filter slots: Remove booked times and apply working hours
                const availableSlots = filterAvailableSlots(
                    timeMatrix, 
                    reservedIntervals, 
                    config.workingHours,
                    config.serviceDuration
                );
                
                // Add unit_id to each slot for coach identification
                availableSlots.forEach(slot => {
                    slot.unit_id = unitId;
                    slot.coach_name = coachName;
                });
                
                allAvailableSlots.push(...availableSlots);
                console.log(`✅ Found ${availableSlots.length} available slots for ${coachName}`);
                
            } catch (error) {
                console.error(`❌ Error processing ${coachName}:`, error.message);
                continue;
            }
        }
        
        // Sort slots by date/time for better display
        allAvailableSlots.sort((a, b) => {
            // Parse dates in UK timezone to avoid UTC interpretation
            const [dateA, timeA] = a.start_time.split(' ');
            const [dateB, timeB] = b.start_time.split(' ');
            
            // Compare dates first, then times
            if (dateA !== dateB) {
                return dateA.localeCompare(dateB);
            }
            
            // If same date, compare times
            return timeA.localeCompare(timeB);
        });
        
        console.log(`\n🎯 Final available slots (${allAvailableSlots.length} total):`);
        allAvailableSlots.forEach(slot => {
            console.log(`   ${slot.start_time} - ${slot.coach_name} (Unit ${slot.unit_id})`);
        });
        
        // Condensed reserved times summary
        console.log(`\n📋 RESERVED TIMES SUMMARY:`);
        for (const unitId of allowedUnits) {
            const coachName = unitId === 4 ? 'Mason' : 'Josh';
            console.log(`\n👨‍🏫 ${coachName} (Unit ${unitId}) Reserved Times:`);
            
            try {
                const reservedRequest = JSON.stringify({
                    jsonrpc: "2.0",
                    method: "getReservedTimeIntervals",
                    params: [
                        req.body.start_date,
                        req.body.end_date,
                        Number(req.body.service_id),
                        Number(unitId),
                        1
                    ],
                    id: 999
                });
                
                const reservedResult = await makeAPIRequest('/admin/', reservedRequest, {
                    'X-Company-Login': config.companyLogin,
                    'X-User-Token': adminToken
                });
                
                const reservedIntervals = reservedResult.result || {};
                
                Object.keys(reservedIntervals).forEach(date => {
                    const dayReserved = reservedIntervals[date];
                    const reservedCount = dayReserved.reduce((count, group) => 
                        count + (group.reserved_time?.length || 0), 0
                    );
                    const notWorkedCount = dayReserved.reduce((count, group) => 
                        count + (group.not_worked_time?.length || 0), 0
                    );
                    
                    if (reservedCount > 0 || notWorkedCount > 0) {
                        console.log(`   📅 ${date}: ${reservedCount} reserved, ${notWorkedCount} not_worked`);
                    } else {
                        console.log(`   📅 ${date}: No reserved intervals`);
                    }
                });
                
            } catch (error) {
                console.error(`❌ Error getting reserved times for ${coachName}:`, error.message);
            }
        }
        
        res.json({ result: allAvailableSlots });
        
    } catch (error) {
        console.error('💥 Error in availability check:', error);
        res.status(500).json({ error: 'Failed to fetch available slots: ' + error.message });
    }
});

// Helper function to make API requests
function makeAPIRequest(path, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        };
        
        const requestHeaders = { ...defaultHeaders, ...headers };
        
        const options = {
            hostname: 'user-api.simplybook.it',
            port: 443,
            path: path,
            method: 'POST',
            headers: requestHeaders
        };

        const req = https.request(options, (response) => {
            let responseData = '';
            
            response.on('data', (chunk) => {
                responseData += chunk;
            });
            
            response.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    resolve(result);
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${error.message}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`Request failed: ${error.message}`));
        });
        
        req.write(data);
        req.end();
    });
}

// Helper function to get company timezone offset
async function getCompanyTimezoneOffset(adminToken, config) {
    try {
        // First try to get timezone offset directly
        const timezoneOffsetRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getCompanyTimezoneOffset",
            params: [],
            id: 1
        });
        
        const timezoneOffsetResult = await makeAPIRequest('/admin/', timezoneOffsetRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        if (!timezoneOffsetResult.error && timezoneOffsetResult.result !== undefined) {
            console.log('📅 Company timezone offset from API:', timezoneOffsetResult.result, 'seconds');
            return timezoneOffsetResult.result;
        }
        
        // Fallback: Get company info and calculate offset
        const companyInfoRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getCompanyInfo",
            params: [],
            id: 2
        });
        
        const companyInfoResult = await makeAPIRequest('/admin/', companyInfoRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        if (companyInfoResult.error) {
            console.log('⚠️ Could not get company timezone info, using default offset 0');
            return 0;
        }
        
        const companyInfo = companyInfoResult.result;
        console.log('📅 Company info:', companyInfo);
        
        // Try to extract timezone from company info
        let companyOffset = 0;
        
        if (companyInfo.timezone) {
            // If timezone is provided, calculate offset
            // For UK timezones, we'll use a simple approach
            const now = new Date();
            const isBST = now.getTimezoneOffset() === -60; // BST is UTC+1
            companyOffset = isBST ? 3600 : 0; // 3600 seconds = 1 hour for BST
        } else if (companyInfo.timezone_offset !== undefined) {
            companyOffset = companyInfo.timezone_offset;
        } else {
            // Default to 0 for UK (assuming company is in UK)
            companyOffset = 0;
        }
        
        console.log('📅 Calculated company timezone offset:', companyOffset, 'seconds');
        return companyOffset;
        
    } catch (error) {
        console.log('⚠️ Error getting company timezone, using default offset 0:', error.message);
        return 0;
    }
}

// Debug endpoint for testing timezone and booking parameters
app.get('/api/debug-booking-params', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const { start_time, service_id, unit_id } = req.query;
        
        if (!start_time || !service_id || !unit_id) {
            return res.status(400).json({ error: 'Missing required parameters: start_time, service_id, unit_id' });
        }
        
        // Get admin token
        const adminTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getUserToken",
            params: [
                config.companyLogin,
                config.adminUsername,
                config.adminPassword
            ],
            id: 1
        });
        
        const adminTokenResult = await makeAPIRequest('/login', adminTokenRequest);
        
        if (adminTokenResult.error) {
            return res.status(500).json({ error: 'Failed to get admin access token' });
        }
        
        const adminToken = adminTokenResult.result;
        
        // Get company timezone info
        const timezoneOffset = await getCompanyTimezoneOffset(adminToken, config);
        
        // Calculate booking parameters
        const [startDate, startTime] = start_time.split(' ');
        const formattedTime = startTime.includes(':') ? startTime : `${startTime}:00`;
        
        const [hour, minute, second] = formattedTime.split(':').map(Number);
        let endHour = hour;
        let endMinute = minute + config.serviceDuration;
        if (endMinute >= 60) {
            endHour += 1;
            endMinute -= 60;
        }
        const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;
        const endDate = startDate;
        
        // Get company info
        const companyInfoRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getCompanyInfo",
            params: [],
            id: 2
        });
        
        const companyInfoResult = await makeAPIRequest('/admin/', companyInfoRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        res.json({
            success: true,
            debug_info: {
                start_time: start_time,
                start_date: startDate,
                start_time_formatted: formattedTime,
                end_date: endDate,
                end_time: endTime,
                service_duration: config.serviceDuration,
                timezone_offset: timezoneOffset,
                company_info: companyInfoResult.result || companyInfoResult.error,
                booking_params: [
                    service_id,
                    unit_id,
                    'CLIENT_ID_PLACEHOLDER',
                    startDate,
                    formattedTime,
                    endDate,
                    endTime,
                    timezoneOffset,
                    {},
                    1
                ]
            }
        });
        
    } catch (error) {
        console.error('Debug booking params error:', error);
        res.status(500).json({ error: 'Failed to debug booking parameters: ' + error.message });
    }
});

// Enhanced booking endpoint with availability validation
app.post('/api/book-session', async (req, res) => {
    console.log("📝 Received booking request:", req.body);
    
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const { 
            start_time, 
            service_id, 
            unit_id, 
            client_name, 
            client_email, 
            client_phone, 
            client_notes 
        } = req.body;
        
        // Ensure unit_id is a number
        const finalUnitId = Array.isArray(unit_id) ? unit_id[0] : unit_id;
        const coachName = finalUnitId === 4 ? 'Mason' : 'Josh';
        
        // Validate required fields
        if (!start_time || !service_id || !finalUnitId || !client_name || !client_email || !client_phone) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Parse booking date and time first
        const [bookingDate, bookingTime] = start_time.split(' ');
        
        console.log(`🎯 Attempting to book with ${coachName} (Unit ${finalUnitId}) at ${start_time}`);
        
        // Step 1: Validate availability before booking
        // Get admin token for validation and booking
        const adminTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getUserToken",
            params: [
                config.companyLogin,
                config.adminUsername,
                config.adminPassword
            ],
            id: 1
        });
        
        const adminTokenResult = await makeAPIRequest('/login', adminTokenRequest);
        
        if (adminTokenResult.error) {
            console.error('❌ Admin token error:', adminTokenResult.error);
            return res.status(500).json({ error: 'Failed to get admin access token' });
        }
        
        const adminToken = adminTokenResult.result;
        console.log('✅ Admin token obtained for booking');
        
        // Step 2: Double-check availability
        const reservedRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getReservedTimeIntervals",
            params: [
                bookingDate,
                bookingDate,
                Number(service_id),
                Number(finalUnitId),
                1
            ],
            id: 2
        });
        
        const reservedResult = await makeAPIRequest('/admin/', reservedRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });

        console.log("🔴 ReservedIntervals raw response:", JSON.stringify(reservedResult, null, 2));

        
        const reservedIntervals = reservedResult.result?.[bookingDate] || [];
        
        if (!isTimeSlotFree(bookingTime, reservedIntervals, config.serviceDuration)) {
            console.log('❌ Time slot no longer available');
            return res.status(409).json({ error: 'This time slot is no longer available' });
        }
        
        console.log('✅ Time slot confirmed available, proceeding with booking');
        
        // Step 3: Create client first to get client ID
        let clientId = null;
        try {
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
        
            console.log('👤 Creating client...');
            
            const clientResult = await makeAPIRequest('/admin/', clientRequest, {
                'X-Company-Login': config.companyLogin,
                'X-User-Token': adminToken
            });
            
            if (clientResult.result && !clientResult.error) {
                clientId = clientResult.result;
                console.log('✅ Client created with ID:', clientId);
            } else {
                console.error('❌ Client creation error:', clientResult.error);
                return res.status(500).json({ error: 'Failed to create client: ' + (clientResult.error?.message || 'Unknown error') });
            }
        } catch (error) {
            console.error('❌ Error creating client:', error);
            return res.status(500).json({ error: 'Failed to create client: ' + error.message });
        }
        
        // Step 4: Create the booking with retry mechanism
        const maxRetries = 3;
        let bookingResult = null;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📅 Booking attempt ${attempt}/${maxRetries}`);
                
                // Re-check availability before each attempt
                const reservedRequest = JSON.stringify({
                    jsonrpc: "2.0",
                    method: "getReservedTimeIntervals",
                    params: [
                        bookingDate,
                        bookingDate,
                        service_id,
                        finalUnitId,
                        1
                    ],
                    id: 2
                });
                
                const reservedResult = await makeAPIRequest('/admin/', reservedRequest, {
                    'X-Company-Login': config.companyLogin,
                    'X-User-Token': adminToken
                });

                console.log("🔴 ReservedIntervals raw response:", JSON.stringify(reservedResult, null, 2));

                
                const reservedIntervals = reservedResult.result?.[bookingDate] || [];
                
                if (!isTimeSlotFree(bookingTime, reservedIntervals, config.serviceDuration)) {
                    console.log(`❌ Time slot no longer available on attempt ${attempt}`);
                    return res.status(409).json({ error: 'This time slot is no longer available' });
                }
                
                // Create the booking using the correct SimplyBook.me API format
                const [startDate, startTime] = start_time.split(' ');
                
                // Ensure time is in HH:MM:SS format
                const formattedTime = startTime.includes(':') ? startTime : `${startTime}:00`;
                
                // Calculate end time based on service duration
                const [hour, minute, second] = formattedTime.split(':').map(Number);
                let endHour = hour;
                let endMinute = minute + config.serviceDuration;
                if (endMinute >= 60) {
                    endHour += 1;
                    endMinute -= 60;
                }
                const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;
                
                // Set end date (same as start date for single-day appointments)
                const endDate = startDate;
                
                // Calculate client time offset
                // For UK clients booking UK services, offset should be 0 (same timezone)
                // clientTimeOffset = company_timezone_offset - client_timezone_offset
                // Since both are in UK timezone, the difference is 0
                const clientTimeOffset = 0; // UK clients booking UK services
                
                console.log('📅 Using client time offset:', clientTimeOffset, 'seconds (UK client booking UK service)');
                
                // Prepare client data according to SimplyBook.me API documentation
                const clientData = {
                    name: client_name,
                    email: client_email,
                    phone: client_phone
                };
                
                // Add notes if provided
                if (client_notes && client_notes.trim()) {
                    clientData.notes = client_notes.trim();
                }
                
                // Additional field values (empty object as per API docs)
                const additionalFieldValues = {};
                
                const bookingRequest = JSON.stringify({
                    jsonrpc: "2.0",
                    method: "book",
                    params: [
                        service_id,           // serviceId
                        finalUnitId,          // performerId (unit_id)
                        clientId,             // clientId (required)
                        startDate,            // startDate (YYYY-MM-DD)
                        formattedTime,        // startTime (HH:MM:SS)
                        endDate,              // endDate (YYYY-MM-DD)
                        endTime,              // endTime (HH:MM:SS)
                        clientTimeOffset,     // clientTimeOffset (seconds)
                        additionalFieldValues, // additionalFieldValues
                        1                     // count
                    ],
                    id: 4
                });
                
                console.log('📅 Creating booking with client ID:', clientId);
                console.log('📅 Service duration:', config.serviceDuration, 'minutes');
                console.log('📅 Start time:', formattedTime, 'End time:', endTime);
                
                bookingResult = await makeAPIRequest('/admin/', bookingRequest, {
                        'X-Company-Login': config.companyLogin,
                    'X-User-Token': adminToken
                });
                
                console.log('📅 Raw booking result:', JSON.stringify(bookingResult, null, 2));
                
                if (bookingResult.error) {
                    lastError = bookingResult.error;
                    console.error(`❌ Booking error on attempt ${attempt}:`, bookingResult.error);
                    
                    // If it's a "not available" error, don't retry
                    if (bookingResult.error.message && bookingResult.error.message.includes('not available')) {
                        return res.status(409).json({ error: 'This time slot is no longer available' });
                    }
                    
                    // Wait before retrying (except on last attempt)
                    if (attempt < maxRetries) {
                        console.log(`⏳ Waiting 1 second before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } else {
                    console.log(`✅ Booking successful on attempt ${attempt}`);
                    break;
                }
            } catch (error) {
                lastError = error;
                console.error(`❌ Booking exception on attempt ${attempt}:`, error);
                
                if (attempt < maxRetries) {
                    console.log(`⏳ Waiting 1 second before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        if (bookingResult && bookingResult.error) {
            console.error('❌ All booking attempts failed:', lastError);
            return res.status(500).json({ error: 'Failed to create booking: ' + lastError.message });
        }
        
        console.log('✅ Booking created successfully:', JSON.stringify(bookingResult.result, null, 2));
        
        const bookingId = bookingResult.result.bookingHash || bookingResult.result.booking_id || bookingResult.result.id;
        
        // Immediately test if the booking appears in reserved intervals
        console.log(`🔍 IMMEDIATE BOOKING VERIFICATION:`);
        try {
            const testReservedRequest = JSON.stringify({
                jsonrpc: "2.0",
                method: "getReservedTimeIntervals",
                params: [
                    bookingDate,
                    bookingDate,
                    Number(service_id),
                    Number(finalUnitId),
                    1
                ],
                id: 999
            });
            
            const testReservedResult = await makeAPIRequest('/admin/', testReservedRequest, {
                'X-Company-Login': config.companyLogin,
                'X-User-Token': adminToken
            });
            
            console.log(`📋 POST-BOOKING RESERVED INTERVALS TEST:`);
            console.log(`   - Test params: [${bookingDate}, ${bookingDate}, ${Number(service_id)}, ${Number(finalUnitId)}, 1]`);
            console.log(`   - Test result:`, JSON.stringify(testReservedResult, null, 2));
            
            const testReservedIntervals = testReservedResult.result?.[bookingDate] || [];
            
            // Check if our booking time appears in reserved intervals
            const isTimeReserved = !isTimeSlotFree(bookingTime, testReservedIntervals, config.serviceDuration);
            console.log(`   - Is ${bookingTime} now reserved? ${isTimeReserved ? 'YES' : 'NO'}`);
            
        } catch (error) {
            console.error(`❌ Error in immediate booking verification:`, error.message);
        }
        
        res.json({
            success: true,
            booking_id: bookingId,
            message: `Booking confirmed with ${coachName} for ${start_time}!`,
            coach_name: coachName,
            unit_id: finalUnitId
        });
        
    } catch (error) {
        console.error('💥 Error processing booking:', error);
        res.status(500).json({ error: 'Failed to process booking: ' + error.message });
    }
});

// Booking status endpoint
app.get('/api/booking-status/:bookingId', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const bookingId = req.params.bookingId;
        
        const tokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getToken",
            params: {
                company_login: config.companyLogin,
                api_key: config.apiToken
            },
            id: 1
        });
        
        const tokenResult = await makeAPIRequest('/login', tokenRequest);
        
        if (tokenResult.error) {
            return res.status(500).json({ error: 'Failed to get access token' });
        }
        
        const accessToken = tokenResult.result;
        
        const bookingRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getBooking",
            params: [bookingId],
            id: 2
        });
        
        const bookingResult = await makeAPIRequest('/', bookingRequest, {
                'X-Company-Login': config.companyLogin,
            'X-Token': accessToken
        });
        
        if (bookingResult.error) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        res.json({
            success: true,
            booking: bookingResult.result
        });
        
    } catch (error) {
        console.error('Error checking booking status:', error);
        res.status(500).json({ error: 'Failed to check booking status' });
    }
});

// Debug endpoint for testing availability checking
app.get('/api/debug-availability-check', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const { date, unit_id, service_id } = req.query;
        
        if (!date || !unit_id || !service_id) {
            return res.status(400).json({ error: 'Missing required parameters: date, unit_id, service_id' });
        }
        
        // Get admin token
        const adminTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getUserToken",
            params: [
                config.companyLogin,
                config.adminUsername,
                config.adminPassword
            ],
            id: 1
        });
        
        const adminTokenResult = await makeAPIRequest('/login', adminTokenRequest);
        
        if (adminTokenResult.error) {
            return res.status(500).json({ error: 'Failed to get admin access token' });
        }
        
        const adminToken = adminTokenResult.result;
        
        // Get reserved intervals for the specific date
        const reservedRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getReservedTimeIntervals",
            params: [
                date,
                date,
                Number(service_id),
                Number(unit_id),
                1
            ],
            id: 2
        });
        
        const reservedResult = await makeAPIRequest('/admin/', reservedRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        const reservedIntervals = reservedResult.result || {};
        const dayReserved = reservedIntervals[date] || [];
        
        // Test specific time slots
        const testSlots = ['16:00', '17:00', '18:00'];
        const slotResults = {};
        
        testSlots.forEach(time => {
            const isFree = isTimeSlotFree(time, dayReserved, config.serviceDuration);
            slotResults[time] = {
                is_free: isFree,
                slot_minutes: timeToMinutes(time),
                slot_end_minutes: timeToMinutes(time) + config.serviceDuration
            };
        });
        
        res.json({
            success: true,
            debug_info: {
                date: date,
                unit_id: unit_id,
                service_id: service_id,
                service_duration: config.serviceDuration,
                reserved_intervals_raw: reservedResult,
                day_reserved: dayReserved,
                slot_results: slotResults,
                working_hours: config.workingHours
            }
        });
        
    } catch (error) {
        console.error('Debug availability check error:', error);
        res.status(500).json({ error: 'Failed to debug availability check: ' + error.message });
    }
});

// Debug endpoint for testing booking verification
app.get('/api/debug-booking-verification', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const { date, time, service_id, unit_id } = req.query;
        
        if (!date || !time || !service_id || !unit_id) {
            return res.status(400).json({ error: 'Missing required parameters: date, time, service_id, unit_id' });
        }
        
        // Get admin token
        const adminTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getUserToken",
            params: [
                config.companyLogin,
                config.adminUsername,
                config.adminPassword
            ],
            id: 1
        });
        
        const adminTokenResult = await makeAPIRequest('/login', adminTokenRequest);
        
        if (adminTokenResult.error) {
            return res.status(500).json({ error: 'Failed to get admin access token' });
        }
        
        const adminToken = adminTokenResult.result;
        
        // Test getReservedTimeIntervals with exact same parameters
        const reservedRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getReservedTimeIntervals",
            params: [
                date,
                date,
                Number(service_id),
                Number(unit_id),
                1
            ],
            id: 2
        });
        
        const reservedResult = await makeAPIRequest('/admin/', reservedRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        const reservedIntervals = reservedResult.result || {};
        const dayReserved = reservedIntervals[date] || [];
        
        // Check if the specific time is reserved
        const isTimeReserved = !isTimeSlotFree(time, dayReserved, config.serviceDuration);
        
        res.json({
            success: true,
            debug_info: {
                test_params: {
                    date: date,
                    time: time,
                    service_id: Number(service_id),
                    unit_id: Number(unit_id)
                },
                getReservedTimeIntervals_params: [date, date, Number(service_id), Number(unit_id), 1],
                reserved_intervals_raw: reservedResult,
                day_reserved: dayReserved,
                is_time_reserved: isTimeReserved,
                service_duration: config.serviceDuration
            }
        });
        
    } catch (error) {
        console.error('Debug booking verification error:', error);
        res.status(500).json({ error: 'Failed to debug booking verification: ' + error.message });
    }
});

// Debug endpoint for testing SimplyBook API playground format
app.get('/api/debug-simplybook-playground', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const { date, service_id, unit_id } = req.query;
        
        if (!date || !service_id || !unit_id) {
            return res.status(400).json({ error: 'Missing required parameters: date, service_id, unit_id' });
        }
        
        // Get admin token
        const adminTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getUserToken",
            params: [
                config.companyLogin,
                config.adminUsername,
                config.adminPassword
            ],
            id: 1
        });
        
        const adminTokenResult = await makeAPIRequest('/login', adminTokenRequest);
        
        if (adminTokenResult.error) {
            return res.status(500).json({ error: 'Failed to get admin access token' });
        }
        
        const adminToken = adminTokenResult.result;
        
        // Test 1: Current array format
        const currentFormatRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getReservedTimeIntervals",
            params: [
                date,
                date,
                Number(service_id),
                Number(unit_id),
                1
            ],
            id: 2
        });
        
        const currentFormatResult = await makeAPIRequest('/admin/', currentFormatRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        // Test 2: Playground object format
        const playgroundFormatRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getReservedTimeIntervals",
            params: {
                from: date,
                to: date,
                service_id: Number(service_id),
                unit_id: Number(unit_id),
                include_client_info: false
            },
            id: 3
        });
        
        const playgroundFormatResult = await makeAPIRequest('/admin/', playgroundFormatRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        // Test 3: Alternative array format (without the last parameter)
        const alternativeFormatRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getReservedTimeIntervals",
            params: [
                date,
                date,
                Number(service_id),
                Number(unit_id)
            ],
            id: 4
        });
        
        const alternativeFormatResult = await makeAPIRequest('/admin/', alternativeFormatRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });
        
        res.json({
            success: true,
            debug_info: {
                test_params: {
                    date: date,
                    service_id: Number(service_id),
                    unit_id: Number(unit_id)
                },
                current_format: {
                    request: currentFormatRequest,
                    result: currentFormatResult
                },
                playground_format: {
                    request: playgroundFormatRequest,
                    result: playgroundFormatResult
                },
                alternative_format: {
                    request: alternativeFormatRequest,
                    result: alternativeFormatResult
                }
            }
        });
        
    } catch (error) {
        console.error('Debug SimplyBook playground error:', error);
        res.status(500).json({ error: 'Failed to debug SimplyBook playground: ' + error.message });
    }
});

// Endpoint to get all bookings for a date range
app.get('/api/check-all-bookings', async (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const { from, to } = req.query;
        if (!from || !to) {
            return res.status(400).json({ error: 'Missing required parameters: from, to' });
        }
        
        // Get admin token
        const adminTokenRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getUserToken",
            params: [
                config.companyLogin,
                config.adminUsername,
                config.adminPassword
            ],
            id: 1
        });
        const adminTokenResult = await makeAPIRequest('/login', adminTokenRequest);
        if (adminTokenResult.error) {
            return res.status(500).json({ error: 'Failed to get admin access token' });
        }
        const adminToken = adminTokenResult.result;

        // Get ALL bookings for date range
        const bookingsRequest = JSON.stringify({
            jsonrpc: "2.0",
            method: "getBookingList",
            params: [
                { from, to }
            ],
            id: 2
        });
        const bookingsResult = await makeAPIRequest('/admin/', bookingsRequest, {
            'X-Company-Login': config.companyLogin,
            'X-User-Token': adminToken
        });

        if (bookingsResult.error) {
            return res.status(500).json({ error: bookingsResult.error });
        }

        res.json({ success: true, bookings: bookingsResult.result });
    } catch (error) {
        console.error('Check all bookings error:', error);
        res.status(500).json({ error: 'Failed to get bookings: ' + error.message });
    }
});


// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Booking success page
app.get('/booking-success', (req, res) => {
    const successHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Successful - Inner Performance</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
                    color: white;
                    margin: 0;
                    padding: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .success-container {
                    text-align: center;
                    max-width: 600px;
                    padding: 40px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    border: 2px solid #fbbf24;
                }
                .success-icon {
                    font-size: 4rem;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #fbbf24;
                    margin-bottom: 20px;
                }
                p {
                    margin-bottom: 30px;
                    line-height: 1.6;
                }
                .btn {
                    display: inline-block;
                    padding: 15px 30px;
                    background: #fbbf24;
                    color: #1e3a8a;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: 600;
                    margin: 10px;
                    transition: transform 0.3s ease;
                }
                .btn:hover {
                    transform: translateY(-2px);
                }
            </style>
        </head>
        <body>
            <div class="success-container">
                <div class="success-icon">✅</div>
                <h1>Booking Confirmed!</h1>
                <p>Your session has been successfully booked. You will receive a confirmation email shortly with all the details.</p>
                <p><strong>What's next?</strong><br>
                We'll send you a detailed preparation guide and any forms that need to be completed before your session.</p>
                <a href="/" class="btn">Return to Home</a>
            </div>
        </body>
        </html>
    `;
    res.send(successHtml);
});

// Booking cancellation page
app.get('/booking-cancelled', (req, res) => {
    const cancelledHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Cancelled - Inner Performance</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
                    color: white;
                    margin: 0;
                    padding: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .cancelled-container {
                    text-align: center;
                    max-width: 600px;
                    padding: 40px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    border: 2px solid #ef4444;
                }
                .cancelled-icon {
                    font-size: 4rem;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #ef4444;
                    margin-bottom: 20px;
                }
                p {
                    margin-bottom: 30px;
                    line-height: 1.6;
                }
                .btn {
                    display: inline-block;
                    padding: 15px 30px;
                    background: #fbbf24;
                    color: #1e3a8a;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: 600;
                    margin: 10px;
                    transition: transform 0.3s ease;
                }
                .btn:hover {
                    transform: translateY(-2px);
                }
            </style>
        </head>
        <body>
            <div class="cancelled-container">
                <div class="cancelled-icon">❌</div>
                <h1>Booking Cancelled</h1>
                <p>Your booking was cancelled. No charges were made.</p>
                <p><strong>Need help?</strong><br>
                If you experienced any issues or have questions, please contact us directly.</p>
                <a href="/" class="btn">Try Again</a>
            </div>
        </body>
        </html>
    `;
    res.send(cancelledHtml);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log('✅ SimplyBook.me integration ready with proper availability checking!');
});