// ================= FIREBASE INITIALIZATION (Placeholder) =================
// You MUST ensure these imports are available if using modern JS modules, 
// or ensure the global 'firebase' object is loaded via script tags.

// Example if using modules (assuming you have a firebase.js setup file):
// import { auth, db } from './firebase.js'; 

// For this code to work, we'll rely on the global 'firebase' object 
// and assume Firestore and Auth are initialized elsewhere.
// =========================================================================

// ================= NAVIGATION =================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    if (sidebar) {
        sidebar.classList.toggle('open');
        // Hide menu toggle button when sidebar opens
        if (menuToggle) {
            if (sidebar.classList.contains('open')) {
                menuToggle.classList.add('hidden');
            } else {
                menuToggle.classList.remove('hidden');
            }
        }
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    if (sidebar) {
        sidebar.classList.remove('open');
        // Show menu toggle button when sidebar closes
        if (menuToggle) {
            menuToggle.classList.remove('hidden');
        }
    }
}

function showSection(sectionId) {
    document.querySelectorAll("main section").forEach(section => section.classList.remove("active"));
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add("active");
    }
    
    // Update sidebar menu active state
    document.querySelectorAll('.sidebar-menu-item button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-menu-item button').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(`'${sectionId}'`)) {
            btn.classList.add('active');
        }
    });

    // Close sidebar after selection (this will show the menu button again)
    closeSidebar();

    // Load section-specific data
    if (sectionId === 'profile') {
        loadProfile();
    } else if (sectionId === 'finance') {
        loadFinancialData();
    } else if (sectionId === 'notifications') {
        loadNotifications();
    } else if (sectionId === 'settings') {
        loadSettings();
    }
}

// ================= AUTH =================
let currentLandlord = null;

/**
 * Replaces checkAuth() with the Firebase standard listener.
 * This function now runs automatically whenever the user signs in or out.
 */
function listenForAuthChanges() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        // Fallback for when Firebase is not yet loaded or initialized
        console.error("Firebase Auth not available. Check script loading.");
        return; 
    }

    // Use the official Firebase onAuthStateChanged listener
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            // --- USER IS SIGNED IN ---
            currentLandlord = {
                id: user.uid, // CRITICAL FIX: Use the official unique Firebase User ID
                name: user.displayName || user.email.split('@')[0], // Use display name or derive from email
                email: user.email
            };
            
            // Hide Auth Overlay
            document.body.classList.add('logged-in');
            const overlay = document.getElementById('authOverlay');
            if (overlay) overlay.style.display = 'none';

            // Update UI with the user's name
            const usernameDisplay = document.querySelector('.username'); // Assuming you use the class from the aesthetic code
            if (usernameDisplay) usernameDisplay.textContent = currentLandlord.name;
            
            // Load this landlord's specific data
            loadTenants();
            loadProfile();
            loadFinancialData();
            loadNotifications();
            
        } else {
            // --- USER IS SIGNED OUT ---
            currentLandlord = null;
            document.body.classList.remove('logged-in');
            const overlay = document.getElementById('authOverlay');
            if (overlay) overlay.style.display = 'flex';
            
            // Clear local tenants and redirect to login
            tenants = [];
            updateTenantTable();
            updatePaymentTable();
            updateDashboard();
            if (window.location.pathname !== '/login.html') {
                 // Only redirect if not already on the login page
                 window.location.href = 'login.html';
            }
        }
    });
}

function logoutLandlord() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().then(() => {
             // Redirect after successful sign-out
             // onAuthStateChanged handles clearing data and redirecting based on the event
        });
    } else {
         // Fallback for non-firebase logout (should not happen if logged in)
         window.location.href = 'login.html';
    }
    // Clean up local storage keys related to OLD manual token system
    localStorage.removeItem('landlordToken');
    localStorage.removeItem('landlordName');
    localStorage.removeItem('landlordEmail');
}

// ================= TENANTS =================
let tenants = [];
let pendingDeleteIndex = null;

// Removed redundant saveTenants() as it was causing duplicate issues and complexity.
// We will rely on individual Firestore operations (add, update, delete) which is cleaner.
// Left the old saveTenants function, but it's now unnecessary.
async function saveTenants() {
    console.warn("saveTenants() is deprecated. Using direct Firestore operations instead.");
    // This function is no longer needed because addTenant, markPaid, and confirmDelete
    // now handle their own Firestore updates (see below).
}


// Load tenants for current landlord
async function loadTenants() {
    if (!currentLandlord) return;

    try {
        const db = firebase.firestore();
        let snapshot;
        
        // Ensure the query always filters by the current user's ID
        const query = db.collection('tenants').where('landlordId', '==', currentLandlord.id);
        
        try {
            // Attempt to order by timestamp (best practice)
            snapshot = await query.orderBy('updatedAt', 'desc').get();
        } catch {
            // Fallback for when the index is missing
            snapshot = await query.get();
        }
        
        tenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error('Failed to load tenants', err);
        tenants = [];
    }

    updateTenantTable();
    updatePaymentTable();
    updateDashboard();
}

// Add tenant form
const tenantForm = document.getElementById("tenantForm");
tenantForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentLandlord) return alert("Landlord not logged in!");

    const name = document.getElementById("tenantName").value;
    const room = document.getElementById("tenantRoom").value;
    const rent = document.getElementById("tenantRent").value;
    const dueDate = document.getElementById("tenantDueDate").value;

    if (!name || !room || !rent || !dueDate) return alert("Fill all fields!");

    const newTenant = {
        name,
        room,
        rent: parseFloat(rent),
        dueDate,
        status: "Unpaid",
        // CRITICAL FIX: Ensure the landlordId is the Firebase UID
        landlordId: currentLandlord.id 
    };

    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            const db = firebase.firestore();
            const docRef = await db.collection('tenants').add({
                ...newTenant,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            newTenant.id = docRef.id;
        }
        tenants.unshift(newTenant); // add to top
    } catch (err) {
        console.error('Failed to add tenant', err);
        // If Firestore failed, we skip adding it to the local list to maintain sync
    }

    updateTenantTable();
    updatePaymentTable();
    updateDashboard();
    loadNotifications(); // Update notifications when tenant is added
    // Removed redundant saveTenants() call here
    tenantForm.reset();
});

// ================= UPDATE TABLES =================
function updateTenantTable() {
    const tbody = document.querySelector("#tenantTable tbody");
    tbody.innerHTML = "";
    tenants.forEach((tenant, index) => {
        const statusClass = tenant.status === "Paid" ? "status-paid" : tenant.status === "Past Due" ? "status-past-due" : "status-unpaid";
        tbody.innerHTML += `
            <tr>
                <td>${tenant.name}</td>
                <td>${tenant.room}</td>
                <td>${tenant.rent}</td>
                <td>${tenant.dueDate}</td>
                <td class="${statusClass}">${tenant.status}</td>
                <td><button class="actionBtn" onclick="deleteTenant(${index})">Delete</button></td>
            </tr>
        `;
    });
}

function updatePaymentTable() {
    const tbody = document.querySelector("#paymentTable tbody");
    tbody.innerHTML = "";
    tenants.forEach((tenant, index) => {
        const statusClass = tenant.status === "Paid" ? "status-paid" : tenant.status === "Past Due" ? "status-past-due" : "status-unpaid";
        const btnHtml = tenant.status === "Paid"
            ? `<button class="actionBtn paid" disabled>PAID</button>`
            : `<button class="actionBtn" onclick="markPaid(${index})">Mark Paid</button>`;
        tbody.innerHTML += `
            <tr>
                <td>${tenant.name}</td>
                <td>${tenant.room}</td>
                <td>${tenant.rent}</td>
                <td>${tenant.dueDate}</td>
                <td class="${statusClass}">${tenant.status}</td>
                <td>${btnHtml}</td>
            </tr>
        `;
    });
}

// ================= DASHBOARD =================
function updateDashboard() {
    const totalEl = document.getElementById("totalTenants");
    const paidEl = document.getElementById("paidTenants");
    const pastDueEl = document.getElementById("pastDueCount");

    const total = tenants.length;
    const paidCount = tenants.filter(t => t.status === "Paid").length;
    
    // Check for past due: status is not 'Paid' AND due date has passed
    const today = new Date().toISOString().split('T')[0];
    const pastDueCount = tenants.filter(t => t.status !== "Paid" && t.dueDate < today).length;

    if (totalEl) { totalEl.innerText = total; totalEl.classList.toggle('metric-zero', total === 0); }
    if (paidEl) { paidEl.innerText = paidCount; paidEl.classList.toggle('metric-zero', paidCount === 0); }
    if (pastDueEl) { pastDueEl.innerText = pastDueCount; pastDueEl.classList.toggle('metric-critical', pastDueCount > 0); }
    
    // Update profile section tenant count
    const profileTotalTenants = document.getElementById('profileTotalTenants');
    if (profileTotalTenants) profileTotalTenants.textContent = total;
    
    // Update financial summary (unpaid amount)
    updateFinancialSummary();
    
    // Reload notifications when tenants change
    loadNotifications();
}

// ================= MARK PAID =================
async function markPaid(index) {
    const tenant = tenants[index];
    tenant.status = 'Paid';

    if (tenant.id && typeof firebase !== 'undefined' && firebase.firestore) {
        try {
            await firebase.firestore().collection('tenants').doc(tenant.id).update({
                status: 'Paid',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to update tenant', err);
            // Revert local change if Firestore fails (optional, but good practice)
            tenant.status = 'Unpaid'; 
        }
    }

    updateTenantTable();
    updatePaymentTable();
    updateDashboard();
    updateFinancialTables();
    updateFinancialSummary();
    // Removed redundant saveTenants() call here
}

// ================= DELETE TENANT =================
function deleteTenant(index) {
    pendingDeleteIndex = index;
    const tenant = tenants[index];
    const msgEl = document.getElementById('deleteModalMessage');
    msgEl.innerText = `Delete tenant "${tenant.name}" (Room: ${tenant.room})? This cannot be undone.`;
    const modal = document.getElementById('deleteModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

async function confirmDelete() {
    if (pendingDeleteIndex === null) return closeDeleteModal();
    const tenant = tenants[pendingDeleteIndex];

    // Delete from Firestore
    if (tenant.id && typeof firebase !== 'undefined' && firebase.firestore) {
        try { await firebase.firestore().collection('tenants').doc(tenant.id).delete(); }
        catch (err) { 
            console.error('Failed to delete from Firestore:', err); 
            return; // Stop if Firestore delete fails
        }
    }

    // Delete locally
    tenants.splice(pendingDeleteIndex, 1);
    pendingDeleteIndex = null;
    
    updateTenantTable();
    updatePaymentTable();
    updateDashboard();
    // Removed redundant saveTenants() call here
    closeDeleteModal();
}

function cancelDelete() { pendingDeleteIndex = null; closeDeleteModal(); }
function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

// ================= PROFILE =================
async function loadProfile() {
    if (!currentLandlord) return;
    
    const userNameEl = document.getElementById('profileName');
    const userEmailEl = document.getElementById('profileEmail');
    const userIdEl = document.getElementById('profileUserId');
    const totalTenantsEl = document.getElementById('profileTotalTenants');
    const createdDateEl = document.getElementById('profileCreatedDate');
    
    if (userNameEl) userNameEl.textContent = currentLandlord.name;
    if (userEmailEl) userEmailEl.textContent = currentLandlord.email;
    if (userIdEl) userIdEl.textContent = currentLandlord.id;
    if (totalTenantsEl) totalTenantsEl.textContent = tenants.length;
    
    // Get account creation date from Firestore
    try {
        const db = firebase.firestore();
        const userDoc = await db.collection('landlords').doc(currentLandlord.id).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            if (data.createdAt && createdDateEl) {
                const date = data.createdAt.toDate();
                createdDateEl.textContent = date.toLocaleDateString();
            }
        }
    } catch (err) {
        console.error('Failed to load profile data', err);
    }
}

// Profile form handler
const profileForm = document.getElementById('profileForm');
profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentLandlord) return alert("Not logged in!");
    
    const newName = document.getElementById('editName').value;
    if (!newName) return alert("Please enter a name!");
    
    try {
        const db = firebase.firestore();
        await db.collection('landlords').doc(currentLandlord.id).update({
            name: newName
        });
        
        currentLandlord.name = newName;
        localStorage.setItem('landlordName', newName);
        loadProfile();
        alert("Profile updated successfully!");
        profileForm.reset();
    } catch (err) {
        console.error('Failed to update profile', err);
        alert("Failed to update profile. Please try again.");
    }
});

// ================= FINANCIAL TRACKING =================
function loadFinancialData() {
    // No need to load from Firestore, we'll use tenant data
    updateFinancialTables();
    updateFinancialSummary();
}

function updateFinancialSummary() {
    // Calculate total income from paid tenants
    const totalIncome = tenants
        .filter(t => t.status === 'Paid')
        .reduce((sum, tenant) => sum + (parseFloat(tenant.rent) || 0), 0);
    
    // Calculate unpaid amount from tenants
    const unpaidAmount = tenants
        .filter(t => t.status !== 'Paid')
        .reduce((sum, tenant) => sum + (parseFloat(tenant.rent) || 0), 0);
    
    const totalIncomeEl = document.getElementById('totalIncome');
    const unpaidEl = document.getElementById('unpaidAmount');
    
    if (totalIncomeEl) totalIncomeEl.textContent = `$${totalIncome.toFixed(2)}`;
    if (unpaidEl) unpaidEl.textContent = `$${unpaidAmount.toFixed(2)}`;
}

function updateFinancialTables() {
    // Update income table with paid tenants
    const incomeTbody = document.querySelector('#incomeTable tbody');
    if (incomeTbody) {
        incomeTbody.innerHTML = '';
        const paidTenants = tenants.filter(t => t.status === 'Paid');
        
        if (paidTenants.length === 0) {
            incomeTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No paid rent records yet</td></tr>';
        } else {
            paidTenants.forEach((tenant) => {
                incomeTbody.innerHTML += `
                    <tr>
                        <td>${tenant.name}</td>
                        <td>${tenant.room}</td>
                        <td>$${parseFloat(tenant.rent || 0).toFixed(2)}</td>
                        <td>${tenant.dueDate || 'N/A'}</td>
                    </tr>
                `;
            });
        }
    }
}


// ================= NOTIFICATIONS =================
let notifications = [];

async function loadNotifications() {
    if (!currentLandlord) return;
    
    // Generate notifications based on tenant data
    notifications = [];
    const today = new Date().toISOString().split('T')[0];
    
    tenants.forEach(tenant => {
        if (tenant.status !== 'Paid' && tenant.dueDate < today) {
            notifications.push({
                id: `past-due-${tenant.id}`,
                type: 'past-due',
                title: 'Past Due Payment',
                message: `${tenant.name} (Room ${tenant.room}) has a past due payment of $${tenant.rent}`,
                date: tenant.dueDate,
                unread: true
            });
        } else if (tenant.status !== 'Paid') {
            const dueDate = new Date(tenant.dueDate);
            const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
            if (daysUntilDue <= 3 && daysUntilDue >= 0) {
                notifications.push({
                    id: `reminder-${tenant.id}`,
                    type: 'reminder',
                    title: 'Payment Reminder',
                    message: `${tenant.name} (Room ${tenant.room}) payment of $${tenant.rent} is due in ${daysUntilDue} day(s)`,
                    date: tenant.dueDate,
                    unread: true
                });
            }
        }
    });
    
    // Load saved notifications from Firestore
    try {
        const db = firebase.firestore();
        const snapshot = await db.collection('notifications')
            .where('landlordId', '==', currentLandlord.id)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            notifications.push({
                id: doc.id,
                ...data,
                unread: data.unread !== false
            });
        });
    } catch (err) {
        console.error('Failed to load notifications', err);
    }
    
    updateNotificationsDisplay();
}

function updateNotificationsDisplay() {
    const notificationsList = document.getElementById('notificationsList');
    if (!notificationsList) return;
    
    if (notifications.length === 0) {
        notificationsList.innerHTML = '<p>No notifications at this time.</p>';
        return;
    }
    
    notificationsList.innerHTML = notifications.map(notif => `
        <div class="notification-item ${notif.unread ? 'unread' : ''}">
            <h4>${notif.title}</h4>
            <p>${notif.message}</p>
            <div class="time">${notif.date || (notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString() : '')}</div>
        </div>
    `).join('');
}

// ================= SETTINGS =================
function loadSettings() {
    // Load dark mode setting
    const darkModeSetting = document.getElementById('darkModeSetting');
    if (darkModeSetting) {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        darkModeSetting.checked = isDarkMode;
        darkModeSetting.addEventListener('change', (e) => {
            const isDark = e.target.checked;
            document.body.classList.toggle('dark-mode', isDark);
            const darkModeToggle = document.getElementById('darkModeToggle');
            if (darkModeToggle) {
                darkModeToggle.textContent = isDark ? '☀️' : '🌙';
            }
            localStorage.setItem('darkMode', isDark);
        });
    }
    
    // Load notification settings
    const emailNotif = document.getElementById('settingsEmailNotifications');
    const paymentReminders = document.getElementById('settingsPaymentReminders');
    const pastDueAlerts = document.getElementById('pastDueAlerts');
    
    if (emailNotif) {
        emailNotif.checked = localStorage.getItem('emailNotifications') !== 'false';
        emailNotif.addEventListener('change', (e) => {
            localStorage.setItem('emailNotifications', e.target.checked);
        });
    }
    
    if (paymentReminders) {
        paymentReminders.checked = localStorage.getItem('paymentReminders') !== 'false';
        paymentReminders.addEventListener('change', (e) => {
            localStorage.setItem('paymentReminders', e.target.checked);
        });
    }
    
    if (pastDueAlerts) {
        pastDueAlerts.checked = localStorage.getItem('pastDueAlerts') !== 'false';
        pastDueAlerts.addEventListener('change', (e) => {
            localStorage.setItem('pastDueAlerts', e.target.checked);
        });
    }
}

function exportData() {
    const data = {
        tenants: tenants,
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentify-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert("Data exported successfully!");
}

function confirmClearData() {
    if (!confirm("Are you sure you want to clear all data? This action cannot be undone!")) return;
    if (!confirm("This will delete ALL tenants. Type 'DELETE' to confirm:")) return;
    
    const confirmation = prompt("Type 'DELETE' to confirm:");
    if (confirmation !== 'DELETE') {
        alert("Data deletion cancelled.");
        return;
    }
    
    // Clear all data from Firestore
    if (currentLandlord && typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        Promise.all([
            // Delete all tenants
            ...tenants.map(t => t.id ? db.collection('tenants').doc(t.id).delete() : Promise.resolve())
        ]).then(() => {
            tenants = [];
            updateTenantTable();
            updatePaymentTable();
            updateDashboard();
            updateFinancialTables();
            updateFinancialSummary();
            alert("All data cleared successfully!");
        }).catch(err => {
            console.error('Failed to clear data', err);
            alert("Failed to clear some data. Please try again.");
        });
    }
}

// ================= DARK MODE =================
document.addEventListener('DOMContentLoaded', () => {
    // START LISTENING FOR AUTH CHANGES INSTEAD OF checkAuth()
    listenForAuthChanges(); 

    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (isDarkMode) { document.body.classList.add('dark-mode'); darkModeToggle.textContent = '☀️'; }

        darkModeToggle.addEventListener('click', () => {
            const isCurrentlyDark = document.body.classList.toggle('dark-mode');
            darkModeToggle.textContent = isCurrentlyDark ? '☀️' : '🌙';
            localStorage.setItem('darkMode', isCurrentlyDark);
            // Update settings checkbox if it exists
            const darkModeSetting = document.getElementById('darkModeSetting');
            if (darkModeSetting) darkModeSetting.checked = isCurrentlyDark;
        });
    }
    
    // Initialize settings when page loads
    loadSettings();
    
    // Close sidebar on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });
});