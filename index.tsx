import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- AI INITIALIZATION ---
// Assume process.env.API_KEY is configured in the environment
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});


// --- DATA INTERFACES ---
type Role = 'associate' | 'admin';

interface Location {
  id: number;
  name: string;
  capacity: number;
}

interface User {
  id: number;
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  locationId: number;
  teamId?: number; // Added for team-based features
}

interface Booking {
  id: number;
  userId: number;
  date: string; // YYYY-MM-DD
  status: 'confirmed' | 'cancelled';
}

interface WaitlistEntry {
  id: number;
  userId: number;
  date: string; // YYYY-MM-DD
  timestamp: number;
}

interface DayStatus {
  bookings: number;
  waitlist: number;
  isFull: boolean;
  isWaitlistFull: boolean;
}

interface LocationDashboardStats {
    locationId: number;
    locationName: string;
    capacity: number;
    booked: number;
    waitlisted: number;
    cancellationsToday: number;
    cancellationsMonth: number;
}

interface DashboardStats {
    totalCapacity: number;
    totalBookedToday: number;
    totalWaitlistedToday: number;
    totalCancellationsToday: number;
    locationStats: LocationDashboardStats[];
}

interface DashboardData extends DashboardStats {
    statsForDate: string;
}


// --- MOCK DATABASE ---
let mockBookings: Booking[] = [];
let mockWaitlist: WaitlistEntry[] = [];
let nextBookingId = 1;
let nextWaitlistId = 1;
let nextUserId = 3000; // Start new user IDs high to avoid collision

const mockLocations: Location[] = [
  { id: 1, name: 'Bengaluru', capacity: 450 },
  { id: 2, name: 'Pune', capacity: 350 },
  { id: 3, name: 'Hyderabad', capacity: 250 },
  { id: 4, name: 'Chennai', capacity: 200 },
];

const generateMockUsers = (): User[] => {
    const users: User[] = [
        // Keep admins
        { id: 1, employeeId: 'A001', name: 'Priya Sharma', email: 'priya.sharma@cognizant.com', role: 'admin', locationId: 1 },
        // Add a predictable associate for easy login, assign to a team
        { id: 2, employeeId: 'E100', name: 'Rajesh Kumar', email: 'rajesh.kumar@cognizant.com', role: 'associate', locationId: 1, teamId: 1 },
    ];
    // Exclude predictable names from random pool to avoid collisions
    const firstNames = ['Sunita', 'Deepak', 'Anil', 'Meena', 'Vikram', 'Anjali', 'Pooja', 'Suresh', 'Kavita', 'Amit', 'Neha', 'Rohan', 'Sanjay', 'Geeta'];
    const lastNames = ['Patil', 'Rao', 'Gupta', 'Singh', 'Reddy', 'Nair', 'Desai', 'Jain', 'Verma', 'Mehta', 'Yadav', 'Mishra', 'Chauhan', 'Bisht'];
    
    let currentUserId = 101;
    let empId = 101;

    for (let i = 0; i < 1250; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const location = mockLocations[i % mockLocations.length];
        users.push({
            id: currentUserId++,
            employeeId: `E${empId++}`,
            name: `${firstName} ${lastName}`,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@cognizant.com`,
            role: 'associate',
            locationId: location.id,
            teamId: Math.floor(i / 25) + 1 // Assign teams of ~25 members
        });
    }
    // Make sure Rajesh has some teammates
    users.push({id: 2000, employeeId: 'E2000', name: 'Anjali Desai', email: 'anjali.desai@cognizant.com', role: 'associate', locationId: 1, teamId: 1});
    users.push({id: 2001, employeeId: 'E2001', name: 'Vikram Singh', email: 'vikram.singh@cognizant.com', role: 'associate', locationId: 1, teamId: 1});
    nextUserId = currentUserId;
    return users;
}

const mockUsers: User[] = generateMockUsers();

// --- HOLIDAY DATA ---
const indianPublicHolidays: Record<number, { date: string; name: string }[]> = {
  2024: [
    { date: '2024-01-26', name: 'Republic Day' },
    { date: '2024-03-25', name: 'Holi' },
    { date: '2024-03-29', name: 'Good Friday' },
    { date: '2024-04-11', name: 'Eid-ul-Fitr' },
    { date: '2024-08-15', name: 'Independence Day' },
    { date: '2024-10-02', name: 'Gandhi Jayanti' },
    { date: '2024-10-31', name: 'Diwali' },
    { date: '2024-12-25', name: 'Christmas' },
  ],
  2025: [
    { date: '2025-01-26', name: 'Republic Day' },
    { date: '2025-03-14', name: 'Holi' },
    { date: '2025-04-18', name: 'Good Friday' },
    { date: '2025-03-31', name: 'Eid-ul-Fitr' },
    { date: '2025-08-15', name: 'Independence Day' },
    { date: '2025-10-02', name: 'Gandhi Jayanti' },
    { date: '2025-10-20', name: 'Diwali' },
    { date: '2025-12-25', name: 'Christmas' },
  ],
};

const getIndianPublicHolidaysForYear = (year: number): Map<string, string> => {
    const holidayMap = new Map<string, string>();
    (indianPublicHolidays[year] || []).forEach(h => holidayMap.set(h.date, h.name));
    return holidayMap;
};


// --- SIMULATED API SERVICE ---
const apiService = {
  login: (email: string, role: Role): Promise<User> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const user = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.role === role);
        if (user) {
          resolve(user);
        } else {
          reject(new Error('Invalid credentials or role. Please try again.'));
        }
      }, 500);
    });
  },
  getMonthlyBookingStatus: (locationId: number, year: number, month: number): Promise<Record<string, DayStatus>> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const location = mockLocations.find(l => l.id === locationId);
        if (!location) return resolve({});

        const usersInLocation = mockUsers.filter(u => u.locationId === locationId).map(u => u.id);

        const status: Record<string, DayStatus> = {};
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const bookingsOnDate = mockBookings.filter(b => b.date === dateStr && usersInLocation.includes(b.userId) && b.status === 'confirmed').length;
          const waitlistOnDate = mockWaitlist.filter(w => w.date === dateStr && usersInLocation.includes(w.userId)).length;

          status[dateStr] = {
            bookings: bookingsOnDate,
            waitlist: waitlistOnDate,
            isFull: bookingsOnDate >= location.capacity,
            isWaitlistFull: waitlistOnDate >= 20, // Increased waitlist cap
          };
        }
        resolve(status);
      }, 300);
    });
  },
  getBookingsForDate: (date: string, locationId: number): Promise<{ bookedUsers: User[]; waitlistedUsers: User[] }> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                const usersInLocation = new Set(mockUsers.filter(u => u.locationId === locationId).map(u => u.id));

                const bookedUserIds = new Set(mockBookings.filter(b => b.date === date && usersInLocation.has(b.userId) && b.status === 'confirmed').map(b => b.userId));
                const waitlistedEntries = mockWaitlist.filter(w => w.date === date && usersInLocation.has(w.userId)).sort((a, b) => a.timestamp - b.timestamp);
                const waitlistedUserIds = new Set(waitlistedEntries.map(w => w.userId));

                const bookedUsers = mockUsers.filter(u => bookedUserIds.has(u.id));
                const waitlistedUsers = mockUsers.filter(u => waitlistedUserIds.has(u.id));

                resolve({ bookedUsers, waitlistedUsers });
            }, 400);
        });
    },
  submitBookings: (userId: number, dates: string[]): Promise<{ success: boolean; message: string }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        dates.forEach(date => {
          mockBookings.push({ id: nextBookingId++, userId, date, status: 'confirmed' });
        });
        resolve({ success: true, message: `Successfully booked ${dates.length} days.` });
      }, 500);
    });
  },
  confirmWaitlist: (userId: number, date: string): Promise<{ success: boolean }> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const waitlistIndex = mockWaitlist.findIndex(w => w.userId === userId && w.date === date);
        if (waitlistIndex > -1) {
          mockWaitlist.splice(waitlistIndex, 1);
          mockBookings.push({ id: nextBookingId++, userId, date, status: 'confirmed' });
          resolve({ success: true });
        } else {
          reject(new Error("User not found on waitlist."));
        }
      }, 300);
    });
  },
  getDashboardStats: (): Promise<DashboardData> => {
      return new Promise((resolve) => {
          setTimeout(() => {
              const today = new Date();
              const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
              const year = nextMonthDate.getFullYear();
              const month = nextMonthDate.getMonth();
              const holidaysForNextMonth = getIndianPublicHolidaysForYear(year);
              let demoDay: Date | undefined;
              for (let i = 1; i <= 7; i++) {
                const d = new Date(year, month, i);
                if (d.getDay() !== 0 && d.getDay() !== 6 && !holidaysForNextMonth.has(formatDateToYMD(d))) {
                    demoDay = d;
                    break;
                }
              }
              if (!demoDay) demoDay = new Date(year, month, 3); // Fallback
              
              const demoDateStr = formatDateToYMD(demoDay);

              const totalCapacity = mockLocations.reduce((sum, loc) => sum + loc.capacity, 0);
              const totalBookedToday = mockBookings.filter(b => b.date === demoDateStr && b.status === 'confirmed').length;
              const totalWaitlistedToday = mockWaitlist.filter(w => w.date === demoDateStr).length;
              const totalCancellationsToday = mockBookings.filter(b => b.date === demoDateStr && b.status === 'cancelled').length;

              const locationStats: LocationDashboardStats[] = mockLocations.map(loc => {
                  const usersInLocation = new Set(mockUsers.filter(u => u.locationId === loc.id).map(u => u.id));
                  
                  const booked = mockBookings.filter(b => b.date === demoDateStr && usersInLocation.has(b.userId) && b.status === 'confirmed').length;
                  const waitlisted = mockWaitlist.filter(w => w.date === demoDateStr && usersInLocation.has(w.userId)).length;
                  const cancellationsToday = mockBookings.filter(b => b.date === demoDateStr && usersInLocation.has(b.userId) && b.status === 'cancelled').length;
                  const cancellationsMonth = mockBookings.filter(b => new Date(b.date + 'T12:00:00').getMonth() === month && usersInLocation.has(b.userId) && b.status === 'cancelled').length;
                  
                  return {
                      locationId: loc.id,
                      locationName: loc.name,
                      capacity: loc.capacity,
                      booked,
                      waitlisted,
                      cancellationsToday,
                      cancellationsMonth,
                  }
              });

              resolve({
                  totalCapacity,
                  totalBookedToday,
                  totalWaitlistedToday,
                  totalCancellationsToday,
                  locationStats,
                  statsForDate: demoDateStr,
              });

          }, 500);
      });
  },
  getAdminInsights: async (stats: DashboardStats): Promise<string> => {
      const prompt = `You are a sharp and concise data analyst providing insights for an office space administrator. You will receive a JSON object containing booking statistics for multiple office locations for a specific day. Your task is to analyze this data and generate a bulleted list of the most important trends, anomalies, and actionable insights. Be direct and data-driven. For example, highlight high utilization, potential capacity issues, or unusual cancellation rates. Do not greet the user or use conversational fluff. Get straight to the insights. Use markdown for bullet points (*).

      Here is the data for analysis:
      ${JSON.stringify(stats, null, 2)}`;

      try {
          const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
          });
          return response.text;
      } catch (error) {
          console.error("Error getting AI insights:", error);
          return "AI insights are currently unavailable.";
      }
  },
  getAIBookingSuggestion: async (promptText: string, context: { monthName: string, year: number, calendarStatus: string, teammatesBookingDates?: string[] }): Promise<{ datesToBook: string[]; suggestion: string; }> => {
      const schema = {
        type: Type.OBJECT,
        properties: {
          datesToBook: {
            type: Type.ARRAY,
            description: "An array of dates in YYYY-MM-DD format that the user should be booked for, based on their request and calendar availability.",
            items: { type: Type.STRING }
          },
          suggestion: {
            type: Type.STRING,
            description: "A friendly, concise message for the user explaining what was booked, why, or why it couldn't be. E.g., 'I've selected all available Tuesdays for you.' or 'To match your team, I've selected the days they will be in the office.' or 'Unfortunately, weekends are unavailable for booking.'"
          }
        },
        required: ['datesToBook', 'suggestion']
      };

      const prompt = `
        User Request: "${promptText}"
        
        Calendar Context for ${context.monthName} ${context.year}:
        ${context.calendarStatus}

        ${context.teammatesBookingDates && context.teammatesBookingDates.length > 0 ? `Teammate's Scheduled Dates: ${context.teammatesBookingDates.join(', ')}` : ''}
      `;

      try {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
                systemInstruction: `You are an intelligent office booking assistant. Your goal is to help users book office desks based on their natural language requests.
                - You will be given the user's request and the calendar status for a specific month.
                - The calendar status lists each day, its status ('available', 'waitlist', 'full', 'weekend', 'holiday'), and its booking percentage.
                - You may also receive a list of dates the user's teammates are booked.

                Your tasks:
                1. Analyze the user's request.
                2. Use the calendar data to find suitable dates. Only suggest dates that are 'available' or 'waitlist'. NEVER suggest 'full', 'weekend', or 'holiday' dates.
                3. Interpret nuanced requests:
                    - "Quiet days" or "focus time": Prioritize days with the LOWEST booking percentage.
                    - "Collaboration days" or "busy days": Prioritize days with the HIGHEST booking percentage that are not full.
                    - "Match my team" or "teammates' schedule": Prioritize booking the user on the provided Teammate's Scheduled Dates.
                4. Formulate a response in the required JSON format. The 'suggestion' should explain your reasoning (e.g., "I found the quietest days for you.").`
            },
          });

          const jsonText = response.text.trim();
          const parsed = JSON.parse(jsonText);
          return parsed;

      } catch (error) {
          console.error("Error getting AI booking suggestion:", error);
          return { datesToBook: [], suggestion: "Sorry, I couldn't process that request. Please try rephrasing or select dates manually." };
      }
  },
    getAdminAiSuggestion: async (promptText: string, context: { waitlistedUsers: User[]; bookedUsers: User[]; availableSpots: number; date: string }): Promise<string> => {
        const simplifiedWaitlist = context.waitlistedUsers.map(u => ({ id: u.employeeId, name: u.name, teamId: u.teamId }));
        const bookedTeamIds = new Set(context.bookedUsers.map(u => u.teamId).filter(id => id !== undefined));

        const systemInstruction = `You are an expert HR administrator assistant. Your task is to analyze a waitlist for office bookings and provide a clear, actionable recommendation.
- You will receive a list of waitlisted employees and context about who is already booked for the day.
- Core principles for recommendations:
  1. **Team Co-location**: Prioritize confirming employees whose teammates are already booked. This fosters collaboration.
- Your response should be a concise, helpful text.
- Start with a brief one-sentence summary of your recommendation.
- Then, add a heading '### Recommendations' and list the users you recommend confirming.
- For each user, bold their name (\`**Name**\`) and provide a short, clear reason.
- You have ${context.availableSpots} spot(s) to fill. Tailor your recommendation to this number. Do not suggest more people than there are spots.
- Be direct and professional. Do not be conversational or use greetings.`;

        const prompt = `
        Admin Request: "${promptText}"

        Context for Date: ${context.date}
        Available Spots: ${context.availableSpots}

        Waitlisted Employees:
        ${JSON.stringify(simplifiedWaitlist, null, 2)}

        Team IDs of already booked employees: [${[...bookedTeamIds].join(', ')}]

        Based on the request and the data, provide your recommendation in the specified format.
      `;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: { systemInstruction }
            });
            return response.text;
        } catch (error) {
            console.error("Error getting admin AI suggestion:", error);
            return "Sorry, I encountered an error while generating suggestions. Please try again.";
        }
    },
    importUsersFromCSV: (csvText: string): Promise<{success: boolean, message: string}> => {
        return new Promise((resolve) => {
            const lines = csvText.split('\n').filter(line => line.trim() !== '');
            const headers = lines[0].split(',').map(h => h.trim());
            const requiredHeaders = ['employeeId', 'name', 'email', 'locationName'];
            
            for (const header of requiredHeaders) {
                if (!headers.includes(header)) {
                    resolve({ success: false, message: `Import failed: Missing required header "${header}".`});
                    return;
                }
            }

            const existingEmails = new Set(mockUsers.map(u => u.email));
            let newUsersAdded = 0;
            const errors: string[] = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const entry: any = {};
                headers.forEach((header, index) => {
                    entry[header] = values[index];
                });

                if (existingEmails.has(entry.email)) {
                    errors.push(`Skipped row ${i+1}: Email "${entry.email}" already exists.`);
                    continue;
                }

                const location = mockLocations.find(l => l.name.toLowerCase() === entry.locationName.toLowerCase());
                if (!location) {
                    errors.push(`Skipped row ${i+1}: Location "${entry.locationName}" not found.`);
                    continue;
                }

                const newUser: User = {
                    id: nextUserId++,
                    employeeId: entry.employeeId,
                    name: entry.name,
                    email: entry.email,
                    role: 'associate',
                    locationId: location.id,
                    teamId: entry.teamId ? parseInt(entry.teamId, 10) : undefined
                };
                mockUsers.push(newUser);
                existingEmails.add(newUser.email);
                newUsersAdded++;
            }
            
            let message = `Successfully imported ${newUsersAdded} new users.`;
            if (errors.length > 0) {
                message += `\nEncountered ${errors.length} issues:\n${errors.slice(0, 5).join('\n')}`;
                 if(errors.length > 5) message += '\n...and more.';
            }

            resolve({ success: newUsersAdded > 0, message });
        });
    },
    getComplianceReport: async (nonCompliantUsers: {name: string, employeeId: string, bookingCount: number}[]): Promise<string> => {
        if (nonCompliantUsers.length === 0) {
            return "Great news! All associates met the booking policy requirements last month."
        }
        
        const systemInstruction = `You are an HR compliance analyst. Your task is to report on "non-compliant" associates based on data provided.
The company policy requires associates to book at least 10 days per month.
You will receive a JSON object containing a list of associates who failed to meet this requirement last month.
Produce a report in markdown format.
- Start with a clear, one-sentence summary of the findings (e.g., "The analysis found X associates who did not meet the monthly booking policy.").
- Then, add a heading '### Non-Compliant Associates'.
- List each non-compliant associate with their name (bolded), their employee ID, and their number of bookings for the month.
- Be direct, professional, and data-driven. Do not add conversational fluff or greetings.`;

        const prompt = `
            Compliance Data for Last Month:
            ${JSON.stringify(nonCompliantUsers, null, 2)}
        `;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction }
            });
            return response.text;
        } catch (error) {
            console.error("Error getting compliance report:", error);
            return "Could not generate the compliance report due to an AI service error.";
        }
    }
};

// --- DATA SEEDING UTILITY ---
const seedInitialData = () => {
    if (mockBookings.length > 0 && mockWaitlist.length > 0) return;

    mockBookings = [];
    mockWaitlist = [];
    const allAssociates = mockUsers.filter(u => u.role === 'associate');
    
    const today = new Date();
    const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const year = nextMonthDate.getFullYear();
    const month = nextMonthDate.getMonth();
    const holidaysForNextMonth = getIndianPublicHolidaysForYear(year);

    let demoDay: Date | undefined;
    for (let i = 1; i <= 7; i++) {
        const d = new Date(year, month, i);
        if (d.getDay() !== 0 && d.getDay() !== 6 && !holidaysForNextMonth.has(formatDateToYMD(d))) {
            demoDay = d;
            break;
        }
    }
    if (!demoDay) demoDay = new Date(year, month, 3); // Fallback if first week is all holiday/weekend

    const addBooking = (user: User, dateStr: string, status: 'confirmed' | 'cancelled' = 'confirmed') => {
        mockBookings.push({ id: nextBookingId++, userId: user.id, date: dateStr, status });
    };

    const addWaitlist = (user: User, dateStr: string) => {
        if (!mockWaitlist.some(w => w.userId === user.id && w.date === dateStr)) {
            mockWaitlist.push({ id: nextWaitlistId++, userId: user.id, date: dateStr, timestamp: Date.now() });
        }
    };

    // --- DEMO-READY SEEDING ---
    const demoDayYMD = formatDateToYMD(demoDay);

    // Scenario for DEMO DAY: Make it busy, create waitlists for the admin to manage
    mockLocations.forEach(loc => {
        const associatesInLocation = allAssociates.filter(u => u.locationId === loc.id);
        const shuffledAssociates = [...associatesInLocation].sort(() => 0.5 - Math.random());
        
        const bookingsToMake = Math.floor(loc.capacity * 0.98);
        const cancellationsToMake = Math.floor(Math.random() * 5) + 3;
        const waitlistToMake = Math.floor(Math.random() * 10) + 5;

        for (let i = 0; i < bookingsToMake; i++) addBooking(shuffledAssociates[i % shuffledAssociates.length], demoDayYMD);
        for (let i = 0; i < cancellationsToMake; i++) addBooking(shuffledAssociates[(bookingsToMake + i) % shuffledAssociates.length], demoDayYMD, 'cancelled');
        for (let i = 0; i < waitlistToMake; i++) addWaitlist(shuffledAssociates[(bookingsToMake + cancellationsToMake + i) % shuffledAssociates.length], demoDayYMD);
    });

    const getNextDayOfWeekInMonth = (date: Date, dayOfWeek: number): Date => {
        const resultDate = new Date(date.getTime());
        const currentDay = date.getDay();
        let diff = dayOfWeek - currentDay;
        if (diff <= 0) diff += 7;
        resultDate.setDate(date.getDate() + diff);
        return resultDate;
    };

    const secondTuesday = getNextDayOfWeekInMonth(new Date(year, month, 7), 2); // Start from 7 to get second week
    const secondWednesday = getNextDayOfWeekInMonth(new Date(year, month, 7), 3);
    
    // Scenario for SECOND TUESDAY of next month: High collaboration day
    const collaborationDate = formatDateToYMD(secondTuesday);
    mockLocations.forEach(loc => {
        const associatesInLocation = allAssociates.filter(u => u.locationId === loc.id);
        const shuffled = [...associatesInLocation].sort(() => 0.5 - Math.random());
        const count = Math.floor(loc.capacity * (0.8 + Math.random() * 0.15));
        for (let i = 0; i < count; i++) addBooking(shuffled[i % shuffled.length], collaborationDate);
    });
    const rajeshTeammates = mockUsers.filter(u => u.teamId === 1 && u.id !== 2);
    rajeshTeammates.forEach(t => addBooking(t, collaborationDate));

    // Scenario for SECOND WEDNESDAY of next month: Quiet focus day
    const focusDate = formatDateToYMD(secondWednesday);
    mockLocations.forEach(loc => {
        const associatesInLocation = allAssociates.filter(u => u.locationId === loc.id);
        const shuffled = [...associatesInLocation].sort(() => 0.5 - Math.random());
        const count = Math.floor(loc.capacity * (0.1 + Math.random() * 0.1));
        for (let i = 0; i < count; i++) addBooking(shuffled[i % shuffled.length], focusDate);
    });
    
    // Add random data for the rest of the month
    const daysInMonth = getDaysInMonth(year, month);
    daysInMonth.forEach(dayDate => {
        const dateStr = formatDateToYMD(dayDate);
        if ([demoDayYMD, collaborationDate, focusDate].includes(dateStr)) return;
        
        const dayOfWeek = dayDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6 || holidaysForNextMonth.has(dateStr)) return;

        mockLocations.forEach(loc => {
            const associatesInLocation = allAssociates.filter(u => u.locationId === loc.id);
            if (associatesInLocation.length === 0) return;
            const shuffled = [...associatesInLocation].sort(() => 0.5 - Math.random());
            const bookingCount = Math.floor(loc.capacity * Math.random());

            for (let i = 0; i < bookingCount; i++) {
                const user = shuffled[i % shuffled.length];
                if (mockBookings.filter(b=>b.date === dateStr && b.status==='confirmed').length < loc.capacity) {
                    addBooking(user, dateStr);
                } else {
                    addWaitlist(user, dateStr);
                }
            }
        });
    });
};


// --- Utility Functions ---
const getDaysInMonth = (year: number, month: number) => {
  const date = new Date(year, month, 1);
  const days = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const getWeek = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const formatDateToYMD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

const renderMarkdown = (text: string) => {
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/### (.*$)/gim, '<h5>$1</h5>');
    html = html.replace(/^\* (.*$)/gim, '<p class="ai-list-item">• $1</p>');
    html = html.replace(/\n/g, '<br />');
    // clean up extra breaks around the list items
    html = html.replace(/<br \/>(\s*<p class="ai-list-item">)/g, '$1'); 
    return { __html: html };
};


// --- REACT COMPONENTS ---

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('associate');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const user = await apiService.login(email, selectedRole);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-content">
        <h1 className="login-title">Office Portal</h1>
        <p className="login-subtitle">Book your space</p>
        <div className="role-selector">
          <button
            className={`role-button ${selectedRole === 'associate' ? 'active' : ''}`}
            onClick={() => setSelectedRole('associate')}
          >
            Associate
          </button>
          <button
            className={`role-button ${selectedRole === 'admin' ? 'active' : ''}`}
            onClick={() => setSelectedRole('admin')}
          >
            Admin
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., rajesh.kumar@cognizant.com"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="submit-button" disabled={isLoading}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
          <p className="error-message">{error}</p>
        </form>
      </div>
    </div>
  );
};

// --- Calendar Component ---
interface CalendarProps {
    date: Date;
    selectedDates: string[];
    onDateClick: (date: string) => void;
    monthlyStatus: Record<string, DayStatus>;
    holidays: Map<string, string>;
    viewMode?: 'associate' | 'admin';
    newlySuggested?: string[];
    minDate?: Date;
}

const Calendar: React.FC<CalendarProps> = ({ date, selectedDates, onDateClick, monthlyStatus, holidays, viewMode = 'associate', newlySuggested = [], minDate }) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDay = firstDay.getDay(); // 0 for Sunday, 1 for Monday, etc.
    const daysInMonth = lastDay.getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const effectiveMinDate = minDate ? new Date(minDate.setHours(0,0,0,0)) : today;

    const renderDays = () => {
        const days = [];
        // Pad start with empty divs
        for (let i = 0; i < startingDay; i++) {
            days.push(<div key={`empty-start-${i}`} className="calendar-day other-month"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const dateStr = formatDateToYMD(currentDate);
            const status = monthlyStatus[dateStr] || { bookings: 0, waitlist: 0, isFull: false, isWaitlistFull: false };
            
            const dayOfWeek = currentDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const holidayName = holidays.get(dateStr);
            const isHoliday = !!holidayName;
            const isSelectableHoliday = isHoliday && viewMode === 'associate'; // Associates can't select holidays

            const isSelected = selectedDates.includes(dateStr);
            const isPast = currentDate < effectiveMinDate;
            
            let className = 'calendar-day';
            let statusText = '';
            let canClick = !isPast;
            let tooltip = `Select date ${dateStr}`;

            if (viewMode === 'associate') {
                if (isPast) {
                    className += ' past-day';
                    tooltip = 'Date is in the past';
                } else if (isWeekend || isSelectableHoliday) {
                    className += ' disabled-day';
                    statusText = isWeekend ? 'Weekend' : holidayName!;
                    tooltip = statusText;
                } else if (isSelected) {
                    className += ' selected-day';
                } else if (status.isFull && status.isWaitlistFull) {
                    className += ' full-day';
                } else if (status.isFull) {
                    className += ' waitlist-day';
                } else {
                    className += ' available-day';
                }
                
                if (newlySuggested.includes(dateStr)) {
                    className += ' ai-suggested';
                }
                
                if (!isWeekend && !isSelectableHoliday && status.isFull && !status.isWaitlistFull) statusText = 'Waitlist';
                if (!isWeekend && !isSelectableHoliday && status.isFull && status.isWaitlistFull) statusText = 'Full';
                canClick = !isPast && !isWeekend && !isSelectableHoliday && !(status.isFull && status.isWaitlistFull);

            } else { // Admin view
                className += ' admin-view';
                if (isPast) className += ' past-day';
                if (isSelected) className += ' admin-selected-day';
                 if (isWeekend || isHoliday) {
                    className += ' disabled-day';
                    statusText = isWeekend ? 'Weekend' : holidayName!;
                 } else {
                    statusText = `${status.bookings} booked`;
                 }
                 canClick = !isPast; // Admin can click any valid day
            }

            days.push(
                <div 
                    key={dateStr} 
                    className={className}
                    onClick={() => canClick && onDateClick(dateStr)}
                    aria-label={tooltip}
                    title={tooltip}
                    role="button"
                >
                    <div className="day-number">{day}</div>
                    <div className="day-status">{statusText}</div>
                </div>
            );
        }
        
        const totalCells = startingDay + daysInMonth;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            days.push(<div key={`empty-end-${i}`} className="calendar-day other-month"></div>);
        }

        return days;
    };
    
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="calendar-container">
            <div className="calendar-grid weekdays">
                {weekDays.map(day => <div key={day} className="weekday">{day}</div>)}
            </div>
            <div className="calendar-grid">
                {renderDays()}
            </div>
        </div>
    );
};

// --- Portal Components ---

interface PortalLayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}

const PortalLayout: React.FC<PortalLayoutProps> = ({ user, onLogout, children }) => {
  return (
    <div className="portal-layout-container">
      <header className="portal-header">
        <h1 className="portal-logo">Office Portal</h1>
        <div className="portal-user-info">
          <span>{user.name}</span>
          <button onClick={onLogout} className="logout-button">Logout</button>
        </div>
      </header>
      <main className="portal-main">
        {children}
      </main>
    </div>
  );
};

interface AssociatePortalProps {
  user: User;
  onDataChange: () => void;
  dataVersion: number;
}

const AssociatePortal: React.FC<AssociatePortalProps> = ({ user, onDataChange, dataVersion }) => {
  const location = mockLocations.find(l => l.id === user.locationId);
  
  const getInitialAssociateDate = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  };
  const initialDate = getInitialAssociateDate();

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [monthlyStatus, setMonthlyStatus] = useState<Record<string, DayStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // AI Assistant State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [newlySuggested, setNewlySuggested] = useState<string[]>([]);


  const aiPromptSuggestions = [
      "Find quiet days for focus",
      "Suggest busy days for collaboration",
      "Match my teammates' schedule",
      "Book me for 3 days next week"
  ];


  const holidays = getIndianPublicHolidaysForYear(currentDate.getFullYear());

  useEffect(() => {
    const fetchStatus = async () => {
      if (!location) return;
      setIsLoading(true);
      const status = await apiService.getMonthlyBookingStatus(location.id, currentDate.getFullYear(), currentDate.getMonth());
      setMonthlyStatus(status);
      setIsLoading(false);
    };
    fetchStatus();
  }, [currentDate, location, dataVersion]);
  
    // Effect to clear the AI suggestion animation
  useEffect(() => {
    if (newlySuggested.length > 0) {
        const timer = setTimeout(() => {
            setNewlySuggested([]);
        }, 2500); // Animation lasts 2.5 seconds
        return () => clearTimeout(timer);
    }
  }, [newlySuggested]);

  const handleDateClick = (dateStr: string) => {
    setSelectedDates(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    );
  };
  
  const handleMonthChange = (offset: number) => {
    setSelectedDates([]);
    setError('');
    setSuccessMessage('');
    setAiResponse('');
    setCurrentDate(prev => {
        const newDate = new Date(prev.getTime());
        newDate.setDate(1); // Go to the first of the month to avoid date overflow issues
        newDate.setMonth(newDate.getMonth() + offset);
        return newDate;
    });
  }
  
  const handleAiBookingRequest = async (promptText = aiPrompt) => {
    if (!promptText.trim() || !location) return;
    
    setIsAiLoading(true);
    setAiResponse('');
    setError('');
    setSuccessMessage('');
    setNewlySuggested([]);

    // --- CONSTRUCT ENHANCED CONTEXT FOR AI ---
    let calendarStatus = '';
    const days = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    const firstOfNextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);


    days.forEach(day => {
        const dateStr = formatDateToYMD(day);
        const dayOfWeek = day.getDay();
        const holidayName = holidays.get(dateStr);
        let statusStr = '';
        let occupancy = 'N/A';

        if (dayOfWeek === 0 || dayOfWeek === 6) {
            statusStr = 'weekend';
        } else if (holidayName) {
            statusStr = `holiday (${holidayName})`;
        } else {
            const status = monthlyStatus[dateStr];
            if (!status || day < firstOfNextMonth) {
                 statusStr = 'past';
            } else {
                occupancy = `${Math.round((status.bookings / location.capacity) * 100)}% booked`;
                if (status.isFull && status.isWaitlistFull) statusStr = 'full';
                else if (status.isFull) statusStr = 'waitlist';
                else statusStr = 'available';
            }
        }
        calendarStatus += `${dateStr}: ${statusStr} (${occupancy})\n`;
    });
    
    let teammatesBookingDates: string[] = [];
    if (user.teamId && (promptText.includes('team') || promptText.includes('teammate'))) {
        const teammates = mockUsers.filter(u => u.teamId === user.teamId && u.id !== user.id);
        const teammateIds = new Set(teammates.map(t => t.id));
        const monthBookings = mockBookings.filter(b => {
             const bookingDate = new Date(b.date + 'T12:00:00');
             return teammateIds.has(b.userId) && b.status === 'confirmed' &&
                    bookingDate.getFullYear() === currentDate.getFullYear() &&
                    bookingDate.getMonth() === currentDate.getMonth();
        });
        teammatesBookingDates = [...new Set(monthBookings.map(b => b.date))];
    }

    const context = {
        monthName: currentDate.toLocaleString('default', { month: 'long' }),
        year: currentDate.getFullYear(),
        calendarStatus,
        teammatesBookingDates
    };

    const result = await apiService.getAIBookingSuggestion(promptText, context);
    
    setAiResponse(result.suggestion);
    if (result.datesToBook && result.datesToBook.length > 0) {
        setSelectedDates(result.datesToBook);
        setNewlySuggested(result.datesToBook); // Trigger animation
    }

    setIsAiLoading(false);
  };


  const handleSubmit = async () => {
    setError('');
    setSuccessMessage('');

    if (selectedDates.length === 0) {
        setError('Please select at least one date to book.');
        return;
    }
    
    const datesByWeek: Record<number, Date[]> = {};
    selectedDates.forEach(dateStr => {
      const dateObj = new Date(dateStr + 'T12:00:00');
      const weekNum = getWeek(dateObj);
      if (!datesByWeek[weekNum]) {
        datesByWeek[weekNum] = [];
      }
      datesByWeek[weekNum].push(dateObj);
    });
    
    for (const week in datesByWeek) {
        const firstDayOfWeek = new Date(datesByWeek[week][0]);
        firstDayOfWeek.setHours(0, 0, 0, 0);
        firstDayOfWeek.setDate(firstDayOfWeek.getDate() - firstDayOfWeek.getDay()); // Sunday

        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 6); // Saturday
        
        // Only apply validation to weeks fully within the currently viewed month
        if (firstDayOfWeek.getMonth() === currentDate.getMonth() && lastDayOfWeek.getMonth() === currentDate.getMonth()) {
            
            let isAnyDayInWeekCompletelyFull = false;
            for (let i = 0; i < 7; i++) {
                const dayInWeek = new Date(firstDayOfWeek);
                dayInWeek.setDate(dayInWeek.getDate() + i);

                const dateStr = formatDateToYMD(dayInWeek);
                const status = monthlyStatus[dateStr];
                
                // A day is 'completely full' if it's booked and its waitlist is also full.
                if (status && status.isFull && status.isWaitlistFull) {
                    isAnyDayInWeekCompletelyFull = true;
                    break; // Found a full day, no need to check further for this week.
                }
            }
            
            // If the week is NOT partially full, and the user selected less than 3 days, show an error.
            if (!isAnyDayInWeekCompletelyFull && datesByWeek[week].length < 3) {
                setError(`Booking failed: You must select at least 3 days for the week of ${firstDayOfWeek.toLocaleDateString()}. This rule is waived if some days in the week are already full.`);
                return;
            }
        }
    }
    
    setIsLoading(true);
    const result = await apiService.submitBookings(user.id, selectedDates);
    if (result.success) {
      setSuccessMessage(result.message);
      setSelectedDates([]);
      onDataChange(); // Trigger a data refresh for all components
    } else {
      setError(result.message);
    }
    setIsLoading(false);
  };

  const isPrevDisabled = currentDate.getFullYear() === initialDate.getFullYear() && currentDate.getMonth() === initialDate.getMonth();

  return (
    <div className="portal-content-container">
      <h2 className="welcome-header">Welcome, {user.name}!</h2>
      <div className="info-card">
        <h3>Your Information</h3>
        <p><strong>Employee ID:</strong> {user.employeeId}</p>
        <p><strong>Assigned Location:</strong> {location?.name || 'N/A'}</p>
      </div>

      <div className="info-card ai-assistant-container">
        <h3>✨ AI Booking Assistant</h3>
        <p>Describe your booking needs, and I'll find the best dates for you.</p>
        <div className="ai-input-group">
          <input
            type="text"
            className="form-input"
            placeholder="e.g., 'Book all Wednesdays and Fridays this month'"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAiBookingRequest()}
            disabled={isAiLoading}
          />
          <button onClick={() => handleAiBookingRequest()} disabled={isAiLoading || !aiPrompt.trim()}>
            {isAiLoading ? 'Thinking...' : 'Ask AI'}
          </button>
        </div>
        <div className="prompt-suggestions">
            {aiPromptSuggestions.map(prompt => (
                <button 
                    key={prompt} 
                    className="prompt-chip"
                    onClick={() => {
                        setAiPrompt(prompt);
                        handleAiBookingRequest(prompt);
                    }}
                    disabled={isAiLoading}
                >
                    {prompt}
                </button>
            ))}
        </div>
        {aiResponse && <div className="ai-response-area">{aiResponse}</div>}
      </div>

      <div className="info-card">
        <h3>Book Your Desk for {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
         <div className="calendar-header">
            <button onClick={() => handleMonthChange(-1)} disabled={isLoading || isPrevDisabled}>&lt; Prev</button>
            <span>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => handleMonthChange(1)} disabled={isLoading}>Next &gt;</button>
        </div>
        {isLoading ? <p>Loading calendar...</p> : 
            <Calendar 
                date={currentDate}
                selectedDates={selectedDates}
                onDateClick={handleDateClick}
                monthlyStatus={monthlyStatus}
                holidays={holidays}
                viewMode="associate"
                newlySuggested={newlySuggested}
                minDate={initialDate}
            />
        }
        <div className="booking-summary">
            <p><strong>{selectedDates.length}</strong> days selected.</p>
            <button className="submit-booking-button" onClick={handleSubmit} disabled={isLoading || selectedDates.length === 0}>
                {isLoading ? 'Submitting...' : 'Submit Bookings for the Month'}
            </button>
             {error && <p className="error-message booking-error">{error}</p>}
             {successMessage && <p className="success-message booking-success">{successMessage}</p>}
        </div>
      </div>
    </div>
  );
};


const UserAvatar: React.FC<{ name: string }> = ({ name }) => {
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    };

    const hashString = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return hash;
    };

    const intToRGB = (i: number) => {
        const c = (i & 0x00FFFFFF).toString(16).toUpperCase();
        return '00000'.substring(0, 6 - c.length) + c;
    };
    
    const initials = getInitials(name);
    const color = intToRGB(hashString(name));

    return (
        <div className="avatar" style={{ backgroundColor: `#${color}` }}>
            {initials}
        </div>
    );
};


interface AdminCalendarViewProps {
  user: User;
  dataVersion: number;
  onDataChange: () => void;
}

const AdminCalendarView: React.FC<AdminCalendarViewProps> = ({ user, dataVersion, onDataChange }) => {
    const [currentLocationId, setCurrentLocationId] = useState(user.locationId);
    
    const getInitialAdminDate = () => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth() + 1, 1);
    };
    const initialDate = getInitialAdminDate();
    
    const [currentDate, setCurrentDate] = useState(initialDate);
    const [monthlyStatus, setMonthlyStatus] = useState<Record<string, DayStatus>>({});
    const [isLoading, setIsLoading] = useState(true);

    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [dailyDetails, setDailyDetails] = useState<{ bookedUsers: User[], waitlistedUsers: User[] } | null>(null);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);

    const [adminAiPrompt, setAdminAiPrompt] = useState('');
    const [adminAiResponse, setAdminAiResponse] = useState('');
    const [isAdminAiLoading, setIsAdminAiLoading] = useState(false);

    const selectedLocation = mockLocations.find(l => l.id === currentLocationId) || mockLocations[0];
    const holidays = getIndianPublicHolidaysForYear(currentDate.getFullYear());

    useEffect(() => {
        const fetchStatusAndSetDefaultDate = async () => {
            setIsLoading(true);
            const status = await apiService.getMonthlyBookingStatus(currentLocationId, currentDate.getFullYear(), currentDate.getMonth());
            setMonthlyStatus(status);
            setIsLoading(false);
            
            const firstOfThisMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

            const firstDayToSelect = Object.keys(status)
                .sort()
                .find(dateStr => {
                    const day = new Date(dateStr + 'T12:00:00');
                    const dayOfWeek = day.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const isHoliday = holidays.has(dateStr);
                    return day >= firstOfThisMonth && !isWeekend && !isHoliday && (status[dateStr]?.bookings > 0 || status[dateStr]?.waitlist > 0);
                });
            
            setSelectedDate(firstDayToSelect || null);
        };
        fetchStatusAndSetDefaultDate();
    }, [currentDate, currentLocationId, dataVersion]);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!selectedDate) {
                setDailyDetails(null);
                return;
            }
            setIsDetailsLoading(true);
            setAdminAiResponse(''); // Clear AI response when date changes
            setAdminAiPrompt('');
            const details = await apiService.getBookingsForDate(selectedDate, currentLocationId);
            setDailyDetails(details);
            setIsDetailsLoading(false);
        };
        fetchDetails();
    }, [selectedDate, currentLocationId, dataVersion]);

    const handleMonthChange = (offset: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev.getTime());
            newDate.setDate(1);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };
    
    const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setCurrentLocationId(Number(e.target.value));
        setSelectedDate(null);
        setDailyDetails(null);
    };

    const handleDateClick = (dateStr: string) => {
        setSelectedDate(dateStr);
    };

    const handleConfirm = async (userId: number) => {
        if (!selectedDate) return;
        setIsDetailsLoading(true);
        try {
            await apiService.confirmWaitlist(userId, selectedDate);
            onDataChange(); // This will trigger a re-fetch via dataVersion change
        } catch (error) {
            console.error("Failed to confirm booking", error);
            setIsDetailsLoading(false); // Manually stop loading on error
        }
    };

    const handleAdminAiRequest = async (promptText = adminAiPrompt) => {
        if (!promptText.trim() || !dailyDetails || !selectedDate) return;

        setIsAdminAiLoading(true);
        setAdminAiResponse('');

        const availableSpots = selectedLocation.capacity - dailyDetails.bookedUsers.length;

        const context = {
            waitlistedUsers: dailyDetails.waitlistedUsers,
            bookedUsers: dailyDetails.bookedUsers,
            availableSpots,
            date: selectedDate
        };
        const result = await apiService.getAdminAiSuggestion(promptText, context);
        setAdminAiResponse(result);
        setIsAdminAiLoading(false);
    };

    const handleExport = () => {
        if (!dailyDetails || !selectedDate) return;
        
        const headers = ['Employee ID', 'Name', 'Email', 'Team ID'];
        const rows = dailyDetails.bookedUsers.map(u => [
            u.employeeId,
            u.name,
            u.email,
            u.teamId || 'N/A'
        ]);

        let csvContent = headers.join(',') + '\n';
        rows.forEach(row => {
            csvContent += row.join(',') + '\n';
        });

        downloadFile(csvContent, `bookings_${selectedDate}.csv`, 'text/csv;charset=utf-8;');
    };

    const adminPromptSuggestions = [
        "Prioritize team collaboration",
        "Who should I confirm first?",
    ];

    const isPrevDisabled = currentDate.getFullYear() === initialDate.getFullYear() && currentDate.getMonth() === initialDate.getMonth();

    return (
        <div className="admin-main-content">
            <div className="admin-calendar-view info-card">
                 <div className="admin-view-header">
                     <h3>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })} Overview</h3>
                     <div className="location-selector-wrapper">
                         <label htmlFor="location-select">Location:</label>
                        <select id="location-select" className="location-selector" value={currentLocationId} onChange={handleLocationChange}>
                            {mockLocations.map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                    </div>
                 </div>
                 <div className="calendar-header">
                    <button onClick={() => handleMonthChange(-1)} disabled={isLoading || isPrevDisabled}>&lt; Prev</button>
                    <span>{selectedLocation.name}</span>
                    <button onClick={() => handleMonthChange(1)} disabled={isLoading}>Next &gt;</button>
                </div>
                 {isLoading ? <p>Loading calendar...</p> : 
                    <Calendar 
                        date={currentDate}
                        selectedDates={selectedDate ? [selectedDate] : []}
                        onDateClick={handleDateClick}
                        monthlyStatus={monthlyStatus}
                        holidays={holidays}
                        viewMode="admin"
                        minDate={initialDate}
                    />
                }
            </div>
            <div className="admin-details-view info-card">
                <div className="admin-details-view-header">
                    <h3>Daily Booking Details</h3>
                    {dailyDetails && dailyDetails.bookedUsers.length > 0 && <button onClick={handleExport} className="export-button">Export (CSV)</button>}
                </div>

                {isDetailsLoading ? <p>Loading details...</p> : 
                 !selectedDate ? <p className="details-prompt">Select a date from the calendar to view details.</p> :
                 dailyDetails && (
                    <div>
                        <p className="details-date-header">
                            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                        <div className="capacity-visual">
                            <strong>Capacity: {dailyDetails.bookedUsers.length} / {selectedLocation.capacity}</strong>
                            <div className="progress-bar-container">
                                <div 
                                  className="progress-bar" 
                                  style={{width: `${(dailyDetails.bookedUsers.length / selectedLocation.capacity) * 100}%`}}>
                                </div>
                            </div>
                        </div>

                        <div className="user-list-container">
                            <h4>Booked Associates ({dailyDetails.bookedUsers.length})</h4>
                            {dailyDetails.bookedUsers.length > 0 ? (
                                <ul className="user-list">
                                    {dailyDetails.bookedUsers.map(u => <li key={u.id}><UserAvatar name={u.name} /><div>{u.name} <span>(ID: {u.employeeId})</span></div></li>)}
                                </ul>
                            ) : <p>No bookings for this day.</p>}
                        </div>

                         <div className="user-list-container">
                            <h4>Waitlisted Associates ({dailyDetails.waitlistedUsers.length})</h4>
                            {dailyDetails.waitlistedUsers.length > 0 ? (
                                <>
                                <ul className="user-list">
                                    {dailyDetails.waitlistedUsers.map(u => (
                                    <li key={u.id}>
                                        <div className="user-info-cell"><UserAvatar name={u.name} /><div>{u.name} <span>(ID: {u.employeeId})</span></div></div>
                                        <button 
                                            className="confirm-button"
                                            onClick={() => handleConfirm(u.id)}
                                            disabled={isDetailsLoading || dailyDetails.bookedUsers.length >= selectedLocation.capacity}
                                        >
                                            Confirm
                                        </button>
                                    </li>))}
                                </ul>
                                <div className="admin-ai-assistant">
                                    <h5>✨ AI Waitlist Assistant</h5>
                                    <p>Ask for recommendations on who to confirm.</p>
                                    <div className="ai-input-group">
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="e.g., 'Prioritize team collaboration'"
                                        value={adminAiPrompt}
                                        onChange={(e) => setAdminAiPrompt(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAdminAiRequest()}
                                        disabled={isAdminAiLoading || (dailyDetails.bookedUsers.length >= selectedLocation.capacity)}
                                    />
                                    <button onClick={() => handleAdminAiRequest()} disabled={isAdminAiLoading || !adminAiPrompt.trim() || (dailyDetails.bookedUsers.length >= selectedLocation.capacity)}>
                                        {isAdminAiLoading ? 'Thinking...' : 'Ask AI'}
                                    </button>
                                    </div>
                                    <div className="prompt-suggestions">
                                        {adminPromptSuggestions.map(prompt => (
                                            <button 
                                                key={prompt} 
                                                className="prompt-chip"
                                                onClick={() => {
                                                    setAdminAiPrompt(prompt);
                                                    handleAdminAiRequest(prompt);
                                                }}
                                                disabled={isAdminAiLoading || (dailyDetails.bookedUsers.length >= selectedLocation.capacity)}
                                            >
                                                {prompt}
                                            </button>
                                        ))}
                                    </div>
                                    {isAdminAiLoading && <p>Analyzing waitlist...</p>}
                                    {adminAiResponse && <div className="ai-response-area" dangerouslySetInnerHTML={renderMarkdown(adminAiResponse)}></div>}
                                </div>
                                </>
                            ) : <p>No one on the waitlist.</p>}
                        </div>
                    </div>
                 )
                }
            </div>
        </div>
    );
};

const AIInsightCard: React.FC<{ insights: string; isLoading: boolean }> = ({ insights, isLoading }) => {
    return (
        <div className="info-card admin-ai-insights">
            <h3>🤖 AI-Powered Insights</h3>
            {isLoading ? <p>Analyzing data...</p> : (
                 <div className="ai-insights-content">
                    {insights.split('*').map((item, index) => {
                       if (item.trim() === '') return null;
                       return <p key={index}>- {item.trim()}</p>
                    })}
                 </div>
            )}
        </div>
    );
}

const AdminDashboard: React.FC<{dataVersion: number}> = ({ dataVersion }) => {
    const [stats, setStats] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [aiInsights, setAiInsights] = useState<string>('');
    const [isAiLoading, setIsAiLoading] = useState(true);

    useEffect(() => {
        const fetchAllData = async () => {
            setIsLoading(true);
            setIsAiLoading(true);
            try {
                const result = await apiService.getDashboardStats();
                setStats(result);
                const insights = await apiService.getAdminInsights(result);
                setAiInsights(insights);
            } catch (error) {
                console.error("Failed to load dashboard data", error);
                setStats(null);
                setAiInsights("Could not load AI insights.");
            } finally {
                setIsLoading(false);
                setIsAiLoading(false);
            }
        }
        fetchAllData();
    }, [dataVersion]);

    if (isLoading) {
        return <p>Loading dashboard...</p>
    }
    if (!stats) {
        return <p>Could not load dashboard statistics.</p>
    }
    
    const demoDateDisplay = new Date(stats.statsForDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    return (
        <div className="admin-dashboard-container">
            <AIInsightCard insights={aiInsights} isLoading={isAiLoading} />
            <div className="summary-card-grid">
                <div className="summary-card">
                    <h4>Bookings ({demoDateDisplay})</h4>
                    <p>{stats.totalBookedToday} <span>/ {stats.totalCapacity}</span></p>
                </div>
                 <div className="summary-card">
                    <h4>Waitlist ({demoDateDisplay})</h4>
                    <p>{stats.totalWaitlistedToday}</p>
                </div>
                 <div className="summary-card">
                    <h4>Cancellations ({demoDateDisplay})</h4>
                    <p>{stats.totalCancellationsToday}</p>
                </div>
            </div>
            <div className="info-card">
                <h3>Location Breakdown for {demoDateDisplay}</h3>
                 <table className="location-stats-table">
                    <thead>
                        <tr>
                            <th>Location</th>
                            <th>Booked / Capacity</th>
                            <th>Utilization</th>
                            <th>Waitlist</th>
                            <th>Cancellations (Day)</th>
                            <th>Cancellations (Month)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.locationStats.map(loc => {
                            const utilization = loc.capacity > 0 ? (loc.booked / loc.capacity) * 100 : 0;
                            return (
                                <tr key={loc.locationId}>
                                    <td>{loc.locationName}</td>
                                    <td>{loc.booked} / {loc.capacity}</td>
                                    <td>
                                        <div className="utilization-bar-bg">
                                            <div 
                                                className="utilization-bar-fg" 
                                                style={{width: `${utilization}%`}}
                                                title={`${utilization.toFixed(1)}%`}
                                            >
                                                <span>{utilization.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{loc.waitlisted}</td>
                                    <td>{loc.cancellationsToday}</td>
                                    <td>{loc.cancellationsMonth}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                 </table>
            </div>
        </div>
    );
}

const AdminToolsView: React.FC<{onDataChange: () => void}> = ({ onDataChange }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<{success: boolean, message: string} | null>(null);

    const [complianceReport, setComplianceReport] = useState('');
    const [isReportLoading, setIsReportLoading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
            setUploadStatus(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setIsUploading(true);
        setUploadStatus(null);
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            const result = await apiService.importUsersFromCSV(text);
            setUploadStatus(result);
            setIsUploading(false);
            if(result.success) onDataChange();
        };
        reader.onerror = () => {
             setUploadStatus({success: false, message: "Error reading the file."});
             setIsUploading(false);
        }
        reader.readAsText(file);
    };

    const handleDownloadSample = () => {
        const sampleCsv = 'employeeId,name,email,locationName,teamId\nE9001,Amit Verma,amit.verma@cognizant.com,Pune,101\nE9002,Sunita Reddy,sunita.reddy@cognizant.com,Bengaluru,102';
        downloadFile(sampleCsv, 'sample_users.csv', 'text/csv');
    };
    
    const handleGenerateComplianceReport = async () => {
        setIsReportLoading(true);
        setComplianceReport('');

        const today = new Date();
        const lastMonthDate = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of last month
        const year = lastMonthDate.getFullYear();
        const month = lastMonthDate.getMonth();
        
        const lastMonthBookings = mockBookings.filter(b => {
            const d = new Date(b.date + 'T12:00:00');
            return b.status === 'confirmed' && d.getFullYear() === year && d.getMonth() === month;
        });

        const userBookingCounts = new Map<number, number>();
        lastMonthBookings.forEach(b => {
            userBookingCounts.set(b.userId, (userBookingCounts.get(b.userId) || 0) + 1);
        });

        const nonCompliantUsers = mockUsers
            .filter(u => u.role === 'associate')
            .filter(u => (userBookingCounts.get(u.id) || 0) < 10)
            .map(u => ({
                name: u.name,
                employeeId: u.employeeId,
                bookingCount: userBookingCounts.get(u.id) || 0,
            }));
            
        const report = await apiService.getComplianceReport(nonCompliantUsers);
        setComplianceReport(report);
        setIsReportLoading(false);
    };


    return (
        <div className="admin-tools-container">
            <div className="info-card">
                <h3>User Management</h3>
                <div className="tool-section">
                    <h4>Import New Users from CSV</h4>
                    <p>Upload a CSV file with new associates. The file must contain columns: <code>employeeId, name, email, locationName, teamId</code> (optional).</p>
                    <div className="import-controls">
                        <button className="secondary-button" onClick={handleDownloadSample}>Download Sample CSV</button>
                        <div className="file-upload-wrapper">
                            <input type="file" id="csv-upload" accept=".csv" onChange={handleFileChange} />
                            <label htmlFor="csv-upload" className="file-upload-label">
                                {file ? file.name : 'Choose a file...'}
                            </label>
                            <button onClick={handleUpload} disabled={!file || isUploading}>
                                {isUploading ? 'Uploading...' : 'Upload'}
                            </button>
                        </div>
                    </div>
                    {uploadStatus && (
                        <div className={`upload-status ${uploadStatus.success ? 'success' : 'error'}`}>
                            {uploadStatus.message.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                        </div>
                    )}
                </div>
            </div>

            <div className="info-card">
                <h3>Reporting</h3>
                <div className="tool-section">
                    <h4>AI-Powered Compliance Report</h4>
                    <p>Generate a report of associates who did not meet the booking policy of at least 10 days last month.</p>
                    <button onClick={handleGenerateComplianceReport} disabled={isReportLoading}>
                        {isReportLoading ? 'Generating...' : 'Generate Compliance Report'}
                    </button>
                    {isReportLoading && <p style={{marginTop: '1rem'}}>Analyzing last month's data...</p>}
                    {complianceReport && (
                        <div className="ai-response-area" dangerouslySetInnerHTML={renderMarkdown(complianceReport)}></div>
                    )}
                </div>
            </div>
        </div>
    );
};


interface AdminPortalProps {
  user: User;
  dataVersion: number;
  onDataChange: () => void;
}

const AdminPortal: React.FC<AdminPortalProps> = ({ user, dataVersion, onDataChange }) => {
    const [activeView, setActiveView] = useState<'dashboard' | 'calendar' | 'tools'>('dashboard');

    return (
        <div className="portal-content-container">
            <div className="admin-header">
                <h2 className="welcome-header">Administrator Portal</h2>
                <nav className="admin-nav">
                    <button 
                        className={`admin-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveView('dashboard')}
                    >Dashboard</button>
                    <button
                        className={`admin-nav-item ${activeView === 'calendar' ? 'active' : ''}`}
                        onClick={() => setActiveView('calendar')}
                    >Calendar View</button>
                    <button
                        className={`admin-nav-item ${activeView === 'tools' ? 'active' : ''}`}
                        onClick={() => setActiveView('tools')}
                    >Admin Tools</button>
                </nav>
            </div>
            {activeView === 'dashboard' && <AdminDashboard dataVersion={dataVersion} />}
            {activeView === 'calendar' && <AdminCalendarView user={user} dataVersion={dataVersion} onDataChange={onDataChange} />}
            {activeView === 'tools' && <AdminToolsView onDataChange={onDataChange} />}
        </div>
    );
};

// Key for cross-tab communication via localStorage.
const SYNC_STORAGE_KEY = 'office-booking-data-version';

// Main App Component (Router)
const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // dataVersion is a timestamp to ensure uniqueness and trigger updates.
  const [dataVersion, setDataVersion] = useState(() => Date.now());

  // This function is called whenever data changes, either in the current tab or another.
  const handleDataChange = () => {
    const newVersion = Date.now();
    // Use localStorage to notify other open tabs of the change.
    localStorage.setItem(SYNC_STORAGE_KEY, newVersion.toString());
    // Update state in the current tab to trigger re-renders.
    setDataVersion(newVersion);
  };

  // This useEffect handles both initial data seeding and cross-tab synchronization.
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      // When data changes in another tab, update the local version to trigger a re-fetch.
      if (event.key === SYNC_STORAGE_KEY && event.newValue) {
        setDataVersion(Number(event.newValue));
      }
    };

    // Listen for storage events from other tabs.
    window.addEventListener('storage', handleStorageChange);
    
    // On initial app load, seed the mock data if it's empty.
    seedInitialData();
    // Trigger an initial data fetch for all components.
    handleDataChange();

    // Clean up the listener when the component unmounts.
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // Empty dependency array ensures this runs only once on mount.

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };
  
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <PortalLayout user={currentUser} onLogout={handleLogout}>
      {currentUser.role === 'admin' ? (
        <AdminPortal user={currentUser} dataVersion={dataVersion} onDataChange={handleDataChange} />
      ) : (
        <AssociatePortal user={currentUser} onDataChange={handleDataChange} dataVersion={dataVersion} />
      )}
    </PortalLayout>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}