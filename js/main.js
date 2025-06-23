 const API_BASE_URL = 'https://haibanhu-server.onrender.com';

    const socket = io(API_BASE_URL);

    // --- GLOBAL STATE & CONFIG ---
    let currentUser = null;
    let allUsers = [];
    let currentProjectId = null;
    let currentWorkflowId = null; 
    let currentColumnStatus = null;
    let lastFocusedInput = null;
    let eventCheckInterval = null;
    const notificationSound = new Audio('../audio/notification.mp3');

    // --- ELEMENT SELECTORS (SHARED) ---
    const body = document.body;
    const header = document.querySelector('header');
    const userMenu = document.getElementById('user-menu');

    const modals = {
        backdrop: document.getElementById('modal-backdrop'),
        addProject: document.getElementById('add-project-modal'),
        editProject: document.getElementById('edit-project-modal'),
        addTask: document.getElementById('add-task-modal'),
        taskDetail: document.getElementById('task-detail-modal'),
        completeTask: document.getElementById('complete-task-modal'),
        confirmation: document.getElementById('confirmation-modal'),
        actionConfig: document.getElementById('action-config-modal'),
        addWorkflow: document.getElementById('add-workflow-modal'),
        appPassword: document.getElementById('app-password-modal'),
        uploadFile: document.getElementById('upload-file-modal'),
        inviteToProject: document.getElementById('invite-to-project-modal'),
        event: document.getElementById('event-modal'),
        gradeTask: document.getElementById('grade-task-modal'),
        modulePicker: document.getElementById('module-picker-modal')
    };

    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const featuresMenuDropdown = document.getElementById('features-menu-dropdown');
    const notificationBtn = document.getElementById('notification-btn');
    const notificationDropdown = document.getElementById('notification-dropdown');

    // --- CORE UTILITIES & HELPERS ---
    async function fetchWithAuth(url, options = {}) {
        const token = localStorage.getItem('haiBanhU_Token');
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) { headers['Authorization'] = `Bearer ${token}`; }
        const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
        if (response.status === 401 || response.status === 403) { handleLogout(); throw new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn."); }
        if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || `Lỗi HTTP: ${response.status}`); }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) { return response.json(); }
        return null;
    }
    function showToast(message, type = 'info', duration = 4000) { 
        const container = document.getElementById('toast-container'); 
        if (!container) return; 

        if (type === 'success' || type === 'error') {
            notificationSound.play().catch(e => {});
        }
        
        const toast = document.createElement('div'); 
        toast.className = `toast ${type}`; 
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' }; 
        toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${message}</span>`; 
        container.appendChild(toast); 
        setTimeout(() => { 
            toast.classList.add('exiting'); 
            toast.addEventListener('animationend', () => toast.remove()); 
        }, duration); 
    }

    function showConfirmationModal(message, title = "Xác nhận hành động") { return new Promise((resolve) => { const confirmModal = modals.confirmation; if (!confirmModal) return resolve(false); confirmModal.querySelector('#confirmation-title').textContent = title; confirmModal.querySelector('#confirmation-message').textContent = message; const confirmBtn = confirmModal.querySelector('#confirm-btn'); const cancelBtn = confirmModal.querySelector('#cancel-btn'); const onConfirm = () => { closeModal(); cleanup(); resolve(true); }; const onCancel = () => { closeModal(); cleanup(); resolve(false); }; const cleanup = () => { confirmBtn.removeEventListener('click', onConfirm); cancelBtn.removeEventListener('click', onCancel); }; confirmBtn.addEventListener('click', onConfirm, { once: true }); cancelBtn.addEventListener('click', onCancel, { once: true }); openModal('confirmation'); }); }
    const openModal = (modalName) => { const modalElement = modals[modalName]; if (modalElement) { modals.backdrop.classList.remove('hidden'); modalElement.classList.remove('hidden'); } else { console.error(`Lỗi: Không tìm thấy modal với tên "${modalName}".`); } };
    const closeModal = () => { if(modals.backdrop) modals.backdrop.classList.add('hidden'); Object.values(modals).forEach(m => { if(m && m.id !== 'modal-backdrop' && m.id !== 'chat-box-template') { m.classList.add('hidden'); } }); };
    const fileToBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); });

    function updateActiveNav() {
        const currentPagePath = window.location.pathname;
        document.querySelectorAll('a.nav-link, .nav-item').forEach(link => {
            const linkHref = link.getAttribute('href');
            if (!linkHref || linkHref === '#') return;
            const linkPath = new URL(linkHref, window.location.origin).pathname;
            
            link.classList.remove('active');

            if (linkPath === currentPagePath) {
                link.classList.add('active');
                const dropdownMenu = link.closest('.dropdown-menu');
                if (dropdownMenu) {
                    dropdownMenu.closest('.dropdown')?.querySelector('.nav-menu-toggle')?.classList.add('active');
                }
            }
        });
    }

    function toggleDockPanel(panelId) {
        const allPanels = document.querySelectorAll('.dock-panel');
        const allDockBtns = document.querySelectorAll('.dock-btn');
        const targetPanel = document.getElementById(panelId);
        const targetBtn = document.querySelector(`.dock-btn[data-panel-id="${panelId}"]`);

        if (!targetPanel) return;

        const isOpening = !targetPanel.classList.contains('is-open');

        allPanels.forEach(panel => panel.classList.remove('is-open'));
        allDockBtns.forEach(btn => btn.classList.remove('active'));
        
        if (isOpening) {
            targetPanel.classList.add('is-open');
            if (targetBtn) targetBtn.classList.add('active');
        }
    }


    // --- USER & SESSION MANAGEMENT ---
    function getCurrentUserFromSession() { const user = sessionStorage.getItem('haiBanhU_CurrentUser'); return user ? JSON.parse(user) : null; }
    function saveCurrentUserToSession(user) { if (!user) { sessionStorage.removeItem('haiBanhU_CurrentUser'); return; } try { sessionStorage.setItem('haiBanhU_CurrentUser', JSON.stringify(user)); } catch (e) { console.error("Lỗi khi lưu vào sessionStorage:", e); } }
    async function updateUserOnServer(specificUpdate = false) { if (!currentUser) return; try { const dataToUpdate = specificUpdate || { name: currentUser.name, title: currentUser.title, bio: currentUser.bio, skills: currentUser.skills, projects: currentUser.projects, workflows: currentUser.workflows, friends: currentUser.friends, friendRequests: currentUser.friendRequests, projectInvites: currentUser.projectInvites, connections: currentUser.connections, avatar: currentUser.avatar }; const result = await fetchWithAuth('/api/user', { method: 'PUT', body: JSON.stringify(dataToUpdate) }); currentUser = result.user; saveCurrentUserToSession(currentUser); const userIndex = allUsers.findIndex(u => u.id === currentUser.id); if (userIndex !== -1) { allUsers[userIndex] = currentUser; } } catch (error) { console.error("Lỗi cập nhật người dùng:", error); showToast("Không thể lưu thay đổi trên máy chủ.", "error"); } }
    function findUserById(userId) { if (!userId || !allUsers) return null; return allUsers.find(u => String(u.id) === String(userId)); }
    const handleLogout = () => { if(eventCheckInterval) clearInterval(eventCheckInterval); localStorage.removeItem('haiBanhU_Token'); sessionStorage.clear(); window.location.replace('/login.html?logout=true'); };

    function initializeEventScheduler() {
        if (eventCheckInterval) clearInterval(eventCheckInterval);
        const notifiedEventIds = new Set(); 
        const checkEvents = async () => {
            try {
                const events = await fetchWithAuth('/api/calendar/events');
                const now = new Date();
                events.forEach(event => {
                    if (notifiedEventIds.has(event.id)) return;
                    const eventStart = new Date(event.start);
                    const diffMinutes = (eventStart.getTime() - now.getTime()) / (1000 * 60);
                    if (diffMinutes > 0 && diffMinutes <= 5) {
                        showToast(`Sự kiện "${event.title}" sắp bắt đầu!`, 'success', 10000); 
                        notifiedEventIds.add(event.id);
                    }
                });
            } catch (error) { console.error("Lỗi khi kiểm tra sự kiện:", error.message); }
        };
        checkEvents();
        eventCheckInterval = setInterval(checkEvents, 60000);
    }

    async function sendFriendRequest(targetId) {
        const button = document.querySelector(`[data-action="add-friend"][data-target-id="${targetId}"]`);
        if (button) {
            button.disabled = true;
            button.innerHTML = 'Đang gửi...';
        }
        try {
            const result = await fetchWithAuth(`/api/friends/request/${targetId}`, { method: 'POST' });
            showToast(result.message, 'success');
            if (button) { button.innerHTML = 'Đã gửi yêu cầu'; }
        } catch (error) {
            showToast(error.message, 'error');
            if (button) { button.disabled = false; button.innerHTML = '<i class="fas fa-user-plus"></i> Thêm bạn bè'; }
        }
    }

    async function handleFriendRequestAction(senderId, action) { 
        try { 
            await fetchWithAuth(`/api/friends/respond/${senderId}`, { method: 'POST', body: JSON.stringify({ action }) }); 
            showToast(`Đã ${action === 'accept' ? 'chấp nhận' : 'từ chối'} lời mời.`, 'success'); 
            allUsers = await fetchWithAuth('/api/users');
            currentUser = allUsers.find(u => u.id === currentUser.id);
            saveCurrentUserToSession(currentUser);
            if(typeof renderNotifications === 'function') renderNotifications(); 
            if(typeof renderFriendList === 'function') renderFriendList(); 
            const publicProfileView = document.getElementById('public-profile-view'); 
            if (publicProfileView && !publicProfileView.classList.contains('hidden')) { 
                if (typeof showPublicProfile === 'function') showPublicProfile(senderId); 
            } 
        } catch (error) { 
            console.error("Lỗi phản hồi yêu cầu kết bạn:", error); 
            showToast(error.message, 'error'); 
        } 
    }

    async function handleProjectInviteAction(projectId, action) { 
        try { 
            await fetchWithAuth(`/api/projects/respond/${projectId}`, { method: 'POST', body: JSON.stringify({ action }) }); 
            showToast(`Đã ${action === 'accept' ? 'tham gia' : 'từ chối'} dự án!`, 'success'); 
            allUsers = await fetchWithAuth('/api/users');
            currentUser = allUsers.find(u => u.id === currentUser.id);
            saveCurrentUserToSession(currentUser);
            if(typeof renderNotifications === 'function') renderNotifications(); 
            if (window.location.pathname.includes('projects.html') && typeof renderProjects === 'function') { 
                renderProjects(); 
            } 
        } catch (error) { 
            console.error("Lỗi phản hồi lời mời dự án:", error); 
            showToast(error.message, 'error'); 
        } 
    }

    async function handlePendingProjectInvite() {
        let inviteCode = sessionStorage.getItem('pendingProjectInvite');
        if (!inviteCode) return;
        sessionStorage.removeItem('pendingProjectInvite');
        showToast('Đang kiểm tra lời mời tham gia dự án...', 'info');
        try {
            const result = await fetchWithAuth(`/api/projects/join/${inviteCode}`, { method: 'GET' });
            if (result.isMember) {
                showToast(`Bạn đã là thành viên của dự án "${result.project.name}"!`, 'info');
                window.location.href = `/page/projects.html?viewProject=${result.project.id}`;
                return;
            }
            const confirmed = await showConfirmationModal(`Bạn có muốn tham gia dự án "${result.project.name}" không?`, 'Xác nhận tham gia');
            if (confirmed) {
                await handleProjectInviteAction(result.project.id, 'accept');
                window.location.href = `/page/projects.html?viewProject=${result.project.id}`;
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    const handleGlobalSearch = (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (!query) return;
            window.location.href = `/page/search.html?q=${encodeURIComponent(query)}`;
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const initializeApp = async () => {
            const token = localStorage.getItem('haiBanhU_Token');
            currentUser = getCurrentUserFromSession();
            if (!token || !currentUser) { 
                if (!window.location.pathname.includes('login.html') && !window.location.pathname.endsWith('/')) { 
                    window.location.replace('/login.html'); 
                } 
                return; 
            }
            try {
                allUsers = await fetchWithAuth('/api/users');
                currentUser = allUsers.find(u => u.id === currentUser.id); 
                saveCurrentUserToSession(currentUser);

                updateInitialUI();
                await handlePendingProjectInvite();
                updateActiveNav();
                initializePageSpecificScripts();
                initializeEventScheduler();
            } catch(error) { 
                console.error("Lỗi khởi tạo ứng dụng:", error.message); 
                showToast("Lỗi kết nối đến server.", "error"); 
            }
        };

        function updateInitialUI() {
            if (!currentUser) return;
            
            socket.emit('joinRoom', currentUser.id);

            if (header) header.style.display = '';
            if(userMenu) userMenu.classList.remove('hidden');
            document.getElementById('username-display').textContent = currentUser.name;
            document.getElementById('user-avatar-nav').src = currentUser.avatar || '../images/default-avatar.png';
            document.getElementById('dropdown-username').textContent = currentUser.name;
            document.getElementById('dropdown-email').textContent = currentUser.email || 'Chưa có email';
            const welcomeMsg = document.getElementById('home-welcome-message');
            if(welcomeMsg) { welcomeMsg.textContent = `Chào mừng trở lại, ${currentUser.name}!`; }
            
            const rightSidebar = document.getElementById('right-sidebar');
            const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
            if(rightSidebar) rightSidebar.classList.remove('hidden'); 
            if(toggleSidebarBtn) toggleSidebarBtn.classList.remove('hidden');
            const sidebarState = localStorage.getItem('sidebarState');
            if (sidebarState === 'collapsed') { 
                body.classList.add('sidebar-collapsed'); 
                if(toggleSidebarBtn) toggleSidebarBtn.querySelector('i').classList.replace('fa-chevron-left', 'fa-chevron-right'); 
            }

            const statProjects = document.getElementById('stat-projects');
            const statTasks = document.getElementById('stat-tasks');
            const statFriends = document.getElementById('stat-friends');

            if (statProjects && statTasks && statFriends) {
                const runningProjects = currentUser.projects?.length || 0;
                const myName = currentUser.name.toLowerCase();
                const todoTasks = currentUser.projects?.reduce((acc, p) => {
                    return acc + (p.tasks?.filter(t => t.status !== 'Đã Hoàn Thành' && t.status !== 'DOCS' && (t.assignee || '').toLowerCase().includes(myName)).length || 0);
                }, 0) || 0;
                const friendsCount = currentUser.friends?.length || 0;

                statProjects.textContent = runningProjects;
                statTasks.textContent = todoTasks;
                statFriends.textContent = friendsCount;
            }
        }

        function initializePageSpecificScripts() {
            const path = window.location.pathname;
            
            if (typeof initializeSidebar === 'function') {
                initializeSidebar();
            }
            
            if (path.includes('home.html') && typeof initializeHomePage === 'function') {
                initializeHomePage();
            } else if (path.includes('projects.html') && typeof initializeProjectsPage === 'function') {
                initializeProjectsPage();
            } else if (path.includes('automation.html') && typeof initializeAutomationPage === 'function') {
                initializeAutomationPage();
            } else if (path.includes('profile.html') && typeof initializeProfilePage === 'function') {
                initializeProfilePage();
            } else if (path.includes('settings.html') && typeof initializeSettingsPage === 'function') {
                initializeSettingsPage();
            } else if (path.includes('search.html') && typeof initializeSearchPage === 'function') {
                initializeSearchPage();
            } else if (path.includes('image-studio.html') && typeof initializeImageStudioPage === 'function') {
                initializeImageStudioPage();
            } else if (path.includes('calendar.html') && typeof initializeCalendarPage === 'function') {
                initializeCalendarPage();
            }
        }

        function setupRealtimeListeners() {
            socket.on('new_notification', (data) => {
                showToast(data.message, 'success');
                fetchWithAuth('/api/users').then(users => {
                    allUsers = users;
                    currentUser = allUsers.find(u => u.id === currentUser.id);
                    saveCurrentUserToSession(currentUser);
                    if (typeof renderNotifications === 'function') {
                        renderNotifications();
                    }
                });
            });

            socket.on('friend_request_accepted', (data) => {
                showToast(data.message, 'success');
                fetchWithAuth('/api/users').then(users => {
                    allUsers = users;
                    currentUser = allUsers.find(u => u.id === currentUser.id);
                    saveCurrentUserToSession(currentUser);
                    if (typeof renderFriendList === 'function') {
                        renderFriendList();
                    }
                });
            });

            // <<< START: SỬA LỖI LOGIC REAL-TIME GÂY ĐĂNG XUẤT >>>
            socket.on('project_updated', async (data) => {
                if (!currentUser || !data.projectId) return;
            
                showToast(data.message, 'info');
            
                try {
                    // 1. Lấy dữ liệu MỚI NHẤT của TẤT CẢ người dùng từ server.
                    // Đây là cách an toàn nhất để đảm bảo dữ liệu đồng bộ.
                    allUsers = await fetchWithAuth('/api/users');
            
                    // 2. Cập nhật lại biến currentUser cục bộ từ danh sách mới nhất.
                    const freshCurrentUser = allUsers.find(u => u.id === currentUser.id);
                    if (!freshCurrentUser) {
                        // Nếu không tìm thấy người dùng hiện tại (rất hiếm, có thể do tài khoản bị xóa), thì đăng xuất.
                        handleLogout();
                        return;
                    }
                    currentUser = freshCurrentUser;
            
                    // 3. Lưu lại `currentUser` đã được đồng bộ hóa vào session.
                    saveCurrentUserToSession(currentUser);
            
                    // 4. Bây giờ, tiến hành render lại giao diện với dữ liệu đã được đảm bảo là mới nhất.
                    const currentPagePath = window.location.pathname;
            
                    if (currentPagePath.includes('projects.html')) {
                        const projectDetailView = document.getElementById('project-detail');
                        // Nếu đang xem chi tiết đúng dự án vừa được cập nhật, thì render lại chi tiết.
                        if (projectDetailView && !projectDetailView.classList.contains('hidden') && currentProjectId === data.projectId) {
                            showProjectDetail(currentProjectId);
                        } else { 
                            // Nếu không, chỉ cần render lại danh sách dự án ở dashboard.
                            if (typeof renderProjects === 'function') renderProjects();
                        }
                    }
            
                    if (currentPagePath.includes('home.html')) {
                        if (typeof renderMyTasks === 'function') renderMyTasks();
                        if (typeof renderProjectFeed === 'function') renderProjectFeed();
                    }
                } catch (error) {
                    // Nếu quá trình lấy dữ liệu mới thất bại, không làm gì cả để tránh đăng xuất.
                    // Lỗi sẽ được hiển thị bởi hàm fetchWithAuth.
                    console.error("Lỗi khi làm mới dữ liệu sau khi cập nhật:", error.message);
                }
            });
            // <<< END: SỬA LỖI LOGIC REAL-TIME >>>
        }

        function setupGlobalListeners() {
            const searchBar = document.getElementById('main-search-bar');
            if (searchBar) {
                searchBar.addEventListener('keypress', handleGlobalSearch);
            }

             document.body.addEventListener('click', (e) => {
                const t = e.target;
                const tClosest = (selector) => t.closest(selector);
                
                const dockBtn = tClosest('.dock-btn');
                if (dockBtn) {
                    toggleDockPanel(dockBtn.dataset.panelId);
                    return;
                }
                const closePanelBtn = tClosest('.close-panel-btn');
                if (closePanelBtn) {
                    toggleDockPanel(closePanelBtn.dataset.panelId);
                    return;
                }
                if (t.id === 'modal-backdrop' && !tClosest('.dock-panel.is-open')) {
                    closeModal();
                }

                const userMenuToggle = tClosest('#user-menu-btn');
                const featuresMenuToggle = tClosest('#features-menu-btn');
                if (userMenuToggle) { userMenuDropdown.classList.toggle('hidden'); userMenu.classList.toggle('open'); if(featuresMenuDropdown) featuresMenuDropdown.classList.add('hidden'); document.getElementById('features-menu')?.classList.remove('open'); return; }
                if(featuresMenuToggle) { featuresMenuDropdown.classList.toggle('hidden'); document.getElementById('features-menu').classList.toggle('open'); if(userMenuDropdown) userMenuDropdown.classList.add('hidden'); if(userMenu) userMenu.classList.remove('open'); }
                if (!tClosest('.dropdown')) { document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.add('hidden')); document.querySelectorAll('.dropdown').forEach(dd => dd.classList.remove('open')); }
                const notifBtn = tClosest('#notification-btn');
                if (notifBtn) { if(notificationDropdown) notificationDropdown.classList.toggle('hidden'); return; }
                if (notificationDropdown && !notificationDropdown.contains(t) && !notifBtn) { notificationDropdown.classList.add('hidden'); }
                if (tClosest('.close-modal-btn') || tClosest('#cancel-btn')) { closeModal(); return; }
                
                const handlersById = {
                    '#logout-btn': handleLogout,
                    '#dark-mode-toggle': () => { body.classList.toggle('light-mode'); body.classList.toggle('dark-mode'); localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light'); },
                    '#toggle-sidebar-btn': () => { 
                        body.classList.toggle('sidebar-collapsed'); 
                        const icon = tClosest('#toggle-sidebar-btn').querySelector('i'); 
                        icon.classList.toggle('fa-chevron-right'); 
                        icon.classList.toggle('fa-chevron-left'); 
                        localStorage.setItem('sidebarState', body.classList.contains('sidebar-collapsed') ? 'collapsed' : 'open'); 
                    },
                };
                for (const [selector, handler] of Object.entries(handlersById)) { if (tClosest(selector)) { handler(); return; } }

                const actionTarget = tClosest('[data-action]');
                if (actionTarget) {
                    const action = actionTarget.dataset.action;
                    const friendId = actionTarget.dataset.friendId, senderId = actionTarget.dataset.senderId, targetId = actionTarget.dataset.targetId, projectId = actionTarget.dataset.projectId;
                    switch (action) {
                        case 'open-chat': if (typeof openChatBox === 'function') openChatBox(friendId); break;
                        case 'accept-friend': case 'decline-friend': handleFriendRequestAction(senderId, action.split('-')[0]); break;
                        case 'accept-project': case 'decline-project': handleProjectInviteAction(projectId, action.split('-')[0]); break;
                        case 'add-friend': if (typeof sendFriendRequest === 'function') sendFriendRequest(targetId); break;
                        case 'view-own-profile': window.location.href = `/page/profile.html`; break;
                    }
                    return;
                }
                if (tClosest('.chat-close-btn')) { tClosest('.chat-box').remove(); return; }

                const chatActionBtn = tClosest('[data-chat-action]');
                if (chatActionBtn && !chatActionBtn.classList.contains('send-btn')) {
                    e.preventDefault();
                    const action = chatActionBtn.dataset.action;
                    const chatBox = chatActionBtn.closest('.chat-box');
                    
                    switch(action) {
                        case 'attach-file': {
                            const fileInput = chatBox.querySelector('[data-chat-action-input="file"]');
                            fileInput.onchange = (event) => {
                                const file = event.target.files[0];
                                if (file) { showToast(`Đã chọn tệp: ${file.name}. Chức năng gửi đang được phát triển.`, 'info'); }
                                event.target.value = null;
                            };
                            fileInput.click();
                            break;
                        }
                        case 'send-image': {
                            const imageInput = chatBox.querySelector('[data-chat-action-input="image"]');
                            imageInput.onchange = (event) => {
                                const file = event.target.files[0];
                                if (file) { showToast(`Đã chọn ảnh: ${file.name}. Chức năng gửi đang được phát triển.`, 'info'); }
                                event.target.value = null;
                            };
                            imageInput.click();
                            break;
                        }
                    }
                    return;
                }
            });
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') { body.classList.replace('light-mode', 'dark-mode'); } 
            else { body.classList.replace('dark-mode', 'light-mode'); }
        }

        initializeApp();
        setupGlobalListeners();
        setupRealtimeListeners();
    });