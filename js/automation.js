// --- START OF FILE js/automation.js ---

// ==========================================================================
//  GLOBAL STATE & CONFIGURATION
// ==========================================================================
let activeWorkflow = null;
let currentAddButton = null;
let googleLinkClient;
let currentlyEditingNodeId = null;
let expressionTargetInput = null;

let isPanning = false;
let isDraggingNode = false;
let hasDragged = false;
let scale = 1;
let pan = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let nodeStartPos = { x: 0, y: 0 };
let lines = [];
let draggedNode = null;
let isWorkflowRunning = false;

const AVAILABLE_MODULES = {
    'system-tools': {
        name: 'Công cụ Hệ thống',
        icon: '<i class="fas fa-screwdriver-wrench"></i>',
        color: '#6b7280',
        modules: [
            { type: 'router', name: 'Bộ định tuyến', desc: 'Cho phép quy trình rẽ thành nhiều nhánh độc lập, chạy song song.', isTrigger: false },
            { type: 'if', name: 'If (Điều kiện)', desc: 'Chỉ cho phép các khối phía sau chạy nếu một điều kiện cụ thể được đáp ứng.', isTrigger: false },
            { type: 'set-variable', name: 'Gán biến', desc: 'Tạo hoặc cập nhật một biến để sử dụng ở các bước sau trong quy trình.', isTrigger: false },
            { type: 'http-request', name: 'HTTP Request', desc: 'Gửi yêu cầu HTTP/HTTPS đến một URL bất kỳ.', isTrigger: false },
        ]
    },
    'triggers': {
        name: 'Điểm kích hoạt',
        icon: '<i class="fas fa-bolt"></i>',
        color: '#10B981',
        modules: [
            { type: 'manual', name: 'Bắt đầu thủ công', desc: 'Chạy quy trình bằng tay khi nhấn nút "Chạy".', isTrigger: true },
            { type: 'schedule', name: 'Theo Lịch trình', desc: 'Tự động chạy quy trình theo một lịch cố định.', isTrigger: true },
            { type: 'webhook', name: 'Webhook', desc: 'Nhận dữ liệu từ dịch vụ bên ngoài qua một URL duy nhất.', isTrigger: true },
        ]
    },
    'project-triggers': {
        name: 'Sự kiện Dự án & Lịch',
        icon: '<i class="fas fa-diagram-project"></i>',
        color: '#3B82F6',
        modules: [
             { type: 'project-event', name: 'Sự kiện Dự án', desc: 'Kích hoạt khi công việc được chuyển cột trong dự án.', isTrigger: true },
             { type: 'calendar-event', name: 'Sự kiện Lịch mới', desc: 'Kích hoạt khi một sự kiện mới được tạo.', isTrigger: true },
        ]
    },
    'ai-tools': {
        name: 'Trí tuệ Nhân tạo',
        icon: '<i class="fas fa-brain"></i>',
        color: '#A78BFA',
        modules: [
             { type: 'ai-agent', name: 'AI Agent (Văn bản & Ảnh)', desc: 'Giao nhiệm vụ cho AI để viết, tóm tắt, dịch hoặc tạo ảnh.', isTrigger: false },
             { type: 'web-scraper', name: 'Trợ lý Nghiên cứu Web', desc: 'AI tự động truy cập, đọc và tóm tắt nội dung trang web.', isTrigger: false },
        ]
    },
    'gmail': {
        name: 'Gmail',
        icon: '<img src="../images/apps/gmail.png"/>',
        color: '#EA4335',
        modules: [
            { type: 'gmail-trigger', name: 'Xem Email mới', desc: 'Kích hoạt khi có email mới trong hộp thư.', isTrigger: true },
            { type: 'email', name: 'Gửi một Email', desc: 'Soạn và gửi một email qua tài khoản đã liên kết.', isTrigger: false },
            { type: 'email-list', name: 'Gửi Email theo danh sách', desc: 'Gửi cùng một nội dung email đến nhiều người từ tệp Excel.', isTrigger: false },
        ]
    },
     'google-sheets': {
        name: 'Google Sheets',
        icon: '<img src="../images/apps/google-sheets.png"/>',
        color: '#34A853',
        modules: [
            { type: 'google-sheets', name: 'Thêm một dòng', desc: 'Thêm một dòng mới vào cuối trang tính đã chỉ định.', isTrigger: false },
        ]
    },
    'google-drive': {
        name: 'Google Drive',
        icon: '<img src="../images/apps/google-drive.png"/>',
        color: '#FFBA00',
        modules: [
            { type: 'drive-watch-files', name: 'Xem tệp mới trong thư mục', desc: 'Kích hoạt khi có tệp mới được thêm vào một thư mục cụ thể.', isTrigger: true },
        ]
    }
};

const ACTION_CONFIG_SCHEMAS = {
    'email': [
        { name: 'recipients', label: 'Người nhận (phân cách bởi ;)', type: 'textarea', rows: 3, placeholder: 'email1@example.com; {{node_1.email}}', required: true },
        { name: 'subject', label: 'Tiêu đề', type: 'text', placeholder: 'Tiêu đề email của bạn', required: true },
        { name: 'body', label: 'Nội dung', type: 'textarea', rows: 8, placeholder: 'Soạn nội dung email ở đây...' },
    ],
    'email-list': [
        { name: 'upload', label: 'Tải lên tệp Excel (.xlsx, .xls)', type: 'file', required: true },
        { name: 'recipients', label: 'Người nhận (tự động điền từ tệp)', type: 'textarea', rows: 3, placeholder: 'Các email từ tệp sẽ hiện ở đây...', required: true, readonly: true },
        { name: 'subject', label: 'Tiêu đề', type: 'text', placeholder: 'Tiêu đề email của bạn', required: true },
        { name: 'body', label: 'Nội dung', type: 'textarea', rows: 8, placeholder: 'Soạn nội dung email ở đây...' },
    ],
    'ai-agent': [
        { 
            name: 'actionType', 
            label: 'Hành động AI', 
            type: 'select', 
            required: true, 
            options: [
                { value: 'generate-text', text: 'Tạo Văn bản (Chat, Tóm tắt,...)' },
                { value: 'generate-image', text: 'Tạo Hình ảnh' }
            ],
            onChange: 'handleAiActionChange'
        },
    ],
    'web-scraper': [
        { name: 'url', label: 'URL Trang web', type: 'text', placeholder: 'https://vnexpress.net/...', required: true }
    ],
    'google-sheets': [
         { name: 'spreadsheetId', label: 'ID Bảng tính', type: 'text', placeholder: 'Dán ID từ URL của Google Sheet', required: true },
         { name: 'sheetName', label: 'Tên Trang tính', type: 'text', placeholder: 'Ví dụ: Trang tính1', required: true },
         { name: 'data', label: 'Dữ liệu các ô (phân cách bởi ,)', type: 'text', placeholder: 'Giá trị cột A, Giá trị cột B,...', required: true },
    ],
    'if': [
        { name: 'variable', label: 'Biến để kiểm tra', type: 'text', placeholder: '{{kết quả từ khối trước.text}}', required: true },
        { name: 'operator', label: 'Toán tử', type: 'select', required: true, options: [
             { value: 'contains', text: 'Chứa (Contains)' }, { value: 'not_contains', text: 'Không chứa (Not Contains)' },
             { value: 'equals', text: 'Bằng (Equals)'}, { value: 'not_equals', text: 'Không bằng (Not Equals)'},
             { value: 'is_empty', text: 'Rỗng (Is Empty)' },
        ]},
        { name: 'value', label: 'Giá trị để so sánh', type: 'text', placeholder: 'Ví dụ: "khuyến mãi"' },
    ],
    'set-variable': [
        { name: 'variableName', label: 'Tên biến', type: 'text', placeholder: 'myVariable', required: true },
        { name: 'variableValue', label: 'Giá trị của biến', type: 'textarea', rows: 3, placeholder: 'Nhập giá trị hoặc dùng biến {{...}}', required: true },
    ],
    'http-request': [
        { name: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/data', required: true },
        { name: 'method', label: 'Phương thức', type: 'select', required: true, options: [
            { value: 'GET', text: 'GET' }, { value: 'POST', text: 'POST' }, { value: 'PUT', text: 'PUT' }, { value: 'DELETE', text: 'DELETE' }
        ]},
        { name: 'headers', label: 'Headers (JSON)', type: 'textarea', rows: 3, placeholder: '{"Content-Type": "application/json"}' },
        { name: 'body', label: 'Body (JSON)', type: 'textarea', rows: 5, placeholder: '{"key": "value"}' },
    ]
};

// ==========================================================================
//  INITIALIZATION & MAIN LOGIC
// ==========================================================================

function initializeAutomationPage() {
    showWorkflowList(); 

    socket.on('workflow_finished', ({ workflowId, status, message }) => {
        if (workflowId !== activeWorkflow?.id) return;
        
        const errorBanner = document.getElementById('workflow-error-banner');
        const errorMessageEl = document.getElementById('workflow-error-message');

        if (status === 'success') {
            showToast(message || 'Quy trình hoàn tất!', 'success');
            errorBanner.classList.add('hidden');
        } else {
            showToast(message || 'Quy trình đã dừng do có lỗi.', 'error');
            errorMessageEl.textContent = message;
            errorBanner.classList.remove('hidden');
        }
        isWorkflowRunning = false;
        document.getElementById('automation-dock-buttons').querySelectorAll('button').forEach(btn => btn.disabled = false);
    });
    
    document.body.addEventListener('click', handleGlobalClick);
    document.getElementById('add-workflow-form')?.addEventListener('submit', handleAddWorkflow); 
    document.getElementById('automation-app-password-form')?.addEventListener('submit', handleAutomationAppPasswordFormSubmit);
    document.getElementById('module-search-input')?.addEventListener('input', handleModuleSearch);
}

async function saveCurrentWorkflow(showAlert = true) {
    if(!currentWorkflowId) return;
    const workflowIndex = currentUser.workflows.findIndex(w => String(w.id) === String(currentWorkflowId));
    if(workflowIndex !== -1) {
        const triggerNode = Object.values(activeWorkflow.nodes).find(n => n.isTrigger);
        if (triggerNode) {
            activeWorkflow.triggerType = triggerNode.type;
        } else {
            activeWorkflow.triggerType = null;
        }

        activeWorkflow.viewState = { pan, scale };

        currentUser.workflows[workflowIndex] = activeWorkflow;
        await updateUserOnServer();
        if(showAlert) showToast('Đã lưu quy trình!', 'success');
    }
}

async function runAutomation() {
    if (isWorkflowRunning) return;

    document.querySelectorAll('.workflow-node').forEach(node => {
        node.classList.remove('is-running', 'is-success', 'is-error');
    });
    lines.forEach(l => {
        l.line.setOptions({ dash: false });
    });

    isWorkflowRunning = true;
    document.getElementById('automation-dock-buttons').querySelectorAll('button').forEach(btn => btn.disabled = true);
    document.getElementById('workflow-error-banner').classList.add('hidden');

    try {
        await saveCurrentWorkflow(false);
        const workflow = currentUser.workflows.find(w => String(w.id) === String(currentWorkflowId));
        if (!workflow) throw new Error("Không tìm thấy quy trình để chạy.");

        socket.once('workflow_started', ({ workflowId }) => {
            if (workflowId !== activeWorkflow.id) return;
        });

        socket.on('workflow_node_update', ({ workflowId, nodeId, status, message }) => {
            if (workflowId !== activeWorkflow.id) return;
            const nodeEl = document.querySelector(`.workflow-node[data-node-id="${nodeId}"]`);
            if (nodeEl) {
                nodeEl.classList.remove('is-running', 'is-success', 'is-error');
                nodeEl.classList.add(`is-${status}`);
            }
        });
        
        await fetchWithAuth(`/api/workflow/run/${currentWorkflowId}`, { method: 'POST', body: JSON.stringify(workflow) });
        showToast('Đang thực thi quy trình...', 'info');

    } catch (error) {
        showToast(error.message, 'error');
        isWorkflowRunning = false;
        document.getElementById('automation-dock-buttons').querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
}

function handleGlobalClick(e) {
    const tClosest = (selector) => e.target.closest(selector);
    
    const popover = document.getElementById('expression-popover');
    const isClickingOnInput = tClosest('.config-input-field');
    
    if (popover && !popover.contains(e.target) && !isClickingOnInput) {
        popover.classList.remove('active');
    }

    if (!tClosest('#module-picker-popover') && !tClosest('.add-node-button')) {
        hideModulePicker();
    }
    
    if (tClosest('.delete-node-from-canvas-btn')) {
        deleteNodeFromWorkflow(e);
        return;
    }
    
    const addBtn = tClosest('.add-node-button');
    if (addBtn) {
        currentAddButton = addBtn;
        showModulePicker(addBtn);
        return;
    }
    
    const actionTarget = tClosest('[data-action]');
    if (actionTarget) {
        const { action, workflowId } = actionTarget.dataset;
        if (action === 'view-workflow') openWorkflowBuilder(workflowId);
        else if (action === 'delete-workflow-card') handleDeleteWorkflow(workflowId);
        else if (action === 'link-google-automation') { initializeGoogleLink(); if (googleLinkClient) googleLinkClient.requestCode(); }
        else if (action === 'open-automation-app-password-modal') openModal('appPassword');
        return;
    }

    const appItem = tClosest('.module-item');
    if(appItem) {
        handleAppSelection(appItem.dataset.appKey);
        return;
    }

    const moduleDetailItem = tClosest('.module-detail-item');
    if(moduleDetailItem) {
        handleModuleSelection(moduleDetailItem.dataset.moduleType);
        return;
    }

    if (isClickingOnInput && !isClickingOnInput.readOnly) {
        expressionTargetInput = isClickingOnInput;
        openExpressionEditor(isClickingOnInput);
    }
    
    const handlersById = { 
        '#add-workflow-btn': () => openModal('addWorkflow'), 
        '#back-to-workflows-btn': () => { if(!isWorkflowRunning) saveCurrentWorkflow(false).then(showWorkflowList); }, 
        '#save-workflow-btn': () => saveCurrentWorkflow(true), 
        '#run-automation-btn': () => runAutomation(),
        '#module-picker-back-btn': () => showMainPickerView(),
        '#close-error-banner-btn': () => document.getElementById('workflow-error-banner').classList.add('hidden'),
    };
    for (const [selector, handler] of Object.entries(handlersById)) {
        if (tClosest(selector)) {
            handler();
            return;
        }
    }
}

const handleAddWorkflow = async (e) => { e.preventDefault(); const nameInput = document.getElementById('workflow-name'); if (!nameInput.value) { showToast('Vui lòng nhập tên quy trình.', 'error'); return; } if (!currentUser.workflows) currentUser.workflows = []; currentUser.workflows.push({ id: String(Date.now()), name: nameInput.value, nodes: {}, connections: [], lastRunStatus: null }); await updateUserOnServer(); closeModal(); renderWorkflows(); showToast('Tạo quy trình mới thành công!', 'success'); e.target.reset(); };
const handleDeleteWorkflow = async (workflowId) => { const confirmed = await showConfirmationModal('Bạn có chắc chắn muốn xóa quy trình này?'); if (!confirmed) return; currentUser.workflows = currentUser.workflows.filter(w => String(w.id) !== String(workflowId)); await updateUserOnServer(); renderWorkflows(); showToast('Đã xóa quy trình.', 'info'); };
const handleAutomationAppPasswordFormSubmit = async (e) => { e.preventDefault(); const appPassword = document.getElementById('automation-app-password').value.trim().replace(/\s/g, ''); if (appPassword.length !== 16) { showToast("Mật khẩu Cấp 2 phải có đúng 16 ký tự.", "error"); return; } if(!currentUser.connections) currentUser.connections = {}; if(!currentUser.connections.gmail) currentUser.connections.gmail = {}; currentUser.connections.gmail.appPassword = appPassword; await updateUserOnServer(); showToast("Đã lưu Mật khẩu Cấp 2!", 'success'); renderAutomationConfig(); closeModal(); }


// ==========================================================================
//  UI RENDERING & VIEW MANAGEMENT
// ==========================================================================

function renderAutomationConfig() { const gmailConn = currentUser.connections?.gmail; const isConnected = gmailConn?.connected; const hasPassword = !!gmailConn?.appPassword; const req1Icon = document.getElementById('automation-gmail-req-1-icon'); const req1Btn = document.getElementById('automation-gmail-req-1-btn'); const req2Icon = document.getElementById('automation-gmail-req-2-icon'); const req2Btn = document.getElementById('automation-gmail-req-2-btn'); if(!req1Icon || !req1Btn || !req2Icon || !req2Btn) return; if (isConnected) { req1Icon.className = 'fa-solid fa-circle-check'; req1Btn.disabled = true; req1Btn.textContent = 'Đã liên kết'; req1Btn.classList.remove('btn-primary'); req1Btn.classList.add('btn-success'); } else { req1Icon.className = 'fa-regular fa-circle'; req1Btn.disabled = false; req1Btn.textContent = 'Liên kết'; req1Btn.classList.remove('btn-success'); req1Btn.classList.add('btn-primary'); } req2Btn.disabled = !isConnected; if (hasPassword) { req2Icon.className = 'fa-solid fa-circle-check'; req2Btn.textContent = 'Đã cung cấp'; } else { req2Icon.className = 'fa-regular fa-circle'; req2Btn.textContent = 'Cung cấp'; } }
function showWorkflowList() { 
    document.getElementById('automation-view').classList.remove('builder-mode');
    removeAllLines(); 
    document.getElementById('workflow-list-view').classList.remove('hidden'); 
    document.getElementById('automation-builder-view').classList.add('hidden'); 
    renderWorkflows(); 
    renderAutomationConfig(); 

    const canvasWrapper = document.querySelector('.automation-canvas-wrapper');
    if (canvasWrapper) {
        canvasWrapper.removeEventListener('mousedown', handleCanvasMouseDown);
        canvasWrapper.removeEventListener('wheel', handleCanvasWheel);
    }
    window.removeEventListener('mousemove', handleCanvasMouseMove);
    window.removeEventListener('mouseup', handleCanvasMouseUp);
}

function updateRunButtonVisibility() {
    const runBtn = document.getElementById('run-automation-btn');
    if (!runBtn || !activeWorkflow) return;
    const isManual = activeWorkflow.triggerType === 'manual';
    runBtn.classList.toggle('hidden', !isManual);
}

function openWorkflowBuilder(workflowId) { 
    document.getElementById('automation-view').classList.add('builder-mode');
    document.getElementById('workflow-list-view').classList.add('hidden'); 
    document.getElementById('automation-builder-view').classList.remove('hidden'); 
    document.getElementById('workflow-error-banner').classList.add('hidden');

    const canvasWrapper = document.querySelector('.automation-canvas-wrapper');
    if (canvasWrapper) {
        canvasWrapper.addEventListener('mousedown', handleCanvasMouseDown);
        canvasWrapper.addEventListener('wheel', handleCanvasWheel);
    }
    window.addEventListener('mousemove', handleCanvasMouseMove);
    window.addEventListener('mouseup', handleCanvasMouseUp);

    currentWorkflowId = workflowId; 
    const workflow = currentUser.workflows.find(w => String(w.id) === String(workflowId)); 
    if (!workflow) { 
        showToast("Lỗi: Không tìm thấy quy trình.", "error"); 
        showWorkflowList(); 
        return; 
    } 
    activeWorkflow = JSON.parse(JSON.stringify(workflow)); 
    if (!activeWorkflow.nodes) activeWorkflow.nodes = {}; 
    if (!activeWorkflow.connections) activeWorkflow.connections = []; 
    
    if (activeWorkflow.viewState && activeWorkflow.viewState.pan && typeof activeWorkflow.viewState.scale === 'number') {
        pan = activeWorkflow.viewState.pan;
        scale = activeWorkflow.viewState.scale;
    } else {
        scale = 1; 
        pan = { x: 50, y: (document.querySelector('.automation-canvas-wrapper').clientHeight / 2) - 50 }; 
    }
    
    updateCanvasTransform(); 
    updateRunButtonVisibility(); 
    renderWorkflowOnCanvas(); 
}
function renderWorkflows() { const list = document.getElementById('workflow-list'); if (!list) return; list.innerHTML = ''; if (!currentUser.workflows || currentUser.workflows.length === 0) { list.innerHTML = `<p class="no-data-message" style="padding: 2rem; text-align: center;">Chưa có quy trình nào.</p>`; return; } currentUser.workflows.forEach((w, index) => { const card = document.createElement('div'); card.className = 'workflow-card'; if (w.lastRunStatus) { card.classList.add(`status-${w.lastRunStatus}`); } card.style.animationDelay = `${index * 50}ms`; card.dataset.workflowId = w.id; const triggerNode = Object.values(w.nodes || {}).find(n => n.isTrigger); let triggerInfo = 'Chưa có điểm bắt đầu'; let triggerIcon = '<i class="fas fa-question-circle"></i>'; if (triggerNode) { const moduleInfo = getModuleInfoByType(triggerNode.type); if (moduleInfo) { triggerInfo = moduleInfo.name; triggerIcon = moduleInfo.app.icon; } } card.innerHTML = `<div class="card-body" data-action="view-workflow" data-workflow-id="${w.id}"><h3>${w.name}</h3><p>Quy trình tự động hóa.</p></div><div class="card-actions"><div class="workflow-card-footer"><div class="app-icon small">${triggerIcon}</div><span>${triggerInfo}</span></div><button class="btn btn-secondary btn-sm" data-action="delete-workflow-card" data-workflow-id="${w.id}"><i class="fas fa-trash-can"></i></button></div>`; list.appendChild(card); }); }

// ==========================================================================
//  GOOGLE AUTHENTICATION
// ==========================================================================
function initializeGoogleLink() { if (typeof google === 'undefined') { showToast("Thư viện Google chưa sẵn sàng, vui lòng thử lại.", "error"); return; } if (googleLinkClient) return; try { const GOOGLE_CLIENT_ID = '71088181818-dcci3a70i15s2v405mhmfnbc4euub70n.apps.googleusercontent.com'; googleLinkClient = google.accounts.oauth2.initCodeClient({ client_id: GOOGLE_CLIENT_ID, scope: 'email profile openid https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly', ux_mode: 'popup', callback: handleGoogleAuthResponse, }); } catch (error) { console.error("Lỗi khởi tạo Google Link:", error); showToast("Lỗi khởi tạo liên kết Google. Kiểm tra Console.", "error"); } }
async function handleGoogleAuthResponse(response) { if (response.code) { showToast('Đang liên kết với Google...', 'info'); try { const result = await fetchWithAuth('/api/user/connect/google', { method: 'POST', body: JSON.stringify({ code: response.code }) }); currentUser = result.user; saveCurrentUserToSession(currentUser); renderAutomationConfig(); showToast(result.message, 'success'); } catch (error) { showToast(error.message, 'error'); } } else { showToast('Xác thực Google đã bị hủy.', 'error'); } }


// ==========================================================================
//  CANVAS & NODE LOGIC
// ==========================================================================
function handleCanvasWheel(e) { e.preventDefault(); if(isWorkflowRunning) return; const wrapper = e.currentTarget; const rect = wrapper.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top; const scaleFactor = 1.1; const oldScale = scale; if (e.deltaY < 0) { scale *= scaleFactor; } else { scale /= scaleFactor; } scale = Math.max(0.2, Math.min(2, scale)); pan.x = mouseX - (mouseX - pan.x) * (scale / oldScale); pan.y = mouseY - (mouseY - pan.y) * (scale / oldScale); updateCanvasTransform(); }
function handleCanvasMouseDown(e) { hasDragged = false; if(isWorkflowRunning) return; const node = e.target.closest('.workflow-node'); if (e.button === 0 && node) { isDraggingNode = true; draggedNode = node; node.style.cursor = 'grabbing'; dragStart.x = e.clientX; dragStart.y = e.clientY; nodeStartPos.x = parseFloat(node.style.left); nodeStartPos.y = parseFloat(node.style.top); return; } if (e.button === 1 || (e.button === 0 && e.target.closest('.automation-canvas-wrapper'))) { isPanning = true; e.currentTarget.classList.add('is-panning'); dragStart.x = e.clientX - pan.x; dragStart.y = e.clientY - pan.y; } }
function handleCanvasMouseMove(e) { if (isPanning) { hasDragged = true; pan.x = e.clientX - dragStart.x; pan.y = e.clientY - dragStart.y; updateCanvasTransform(); } if (isDraggingNode && draggedNode) { hasDragged = true; const dx = e.clientX - dragStart.x; const dy = e.clientY - dragStart.y; const newX = nodeStartPos.x + dx / scale; const newY = nodeStartPos.y + dy / scale; activeWorkflow.nodes[draggedNode.dataset.nodeId].position = { x: newX, y: newY }; requestAnimationFrame(renderWorkflowOnCanvas); } }
function handleCanvasMouseUp(e) { 
    if (isDraggingNode && !hasDragged) { 
        const nodeEl = e.target.closest('.workflow-node'); 
        if (nodeEl && !e.target.closest('.delete-node-from-canvas-btn')) { 
            openConfigModalForNode(nodeEl);
        }
    } 
    isPanning = false; 
    isDraggingNode = false; 
    if (draggedNode) { 
        draggedNode.style.cursor = 'move'; 
    } 
    draggedNode = null; 
    document.querySelector('.automation-canvas-wrapper')?.classList.remove('is-panning'); 
}
function updateCanvasTransform() { const canvas = document.getElementById('automation-canvas'); if (canvas) { canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`; repositionAllLines(); } }

function renderWorkflowOnCanvas() {
    const canvas = document.getElementById('automation-canvas');
    if (!canvas) return;
    canvas.innerHTML = '';
    removeAllLines();

    if (!activeWorkflow || !activeWorkflow.nodes) return;

    if (Object.keys(activeWorkflow.nodes).length === 0) {
        const addBtn = createAddNodeButton('initial');
        const canvasWrapper = document.querySelector('.automation-canvas-wrapper');
        const centerX = (canvasWrapper.clientWidth / 2 - pan.x) / scale;
        const centerY = (canvasWrapper.clientHeight / 2 - pan.y) / scale;
        addBtn.style.left = `${centerX - 45}px`;
        addBtn.style.top = `${centerY - 45}px`;
        canvas.appendChild(addBtn);
        return;
    }

    Object.values(activeWorkflow.nodes).forEach(nodeData => {
        if (nodeData.position) {
            const nodeEl = createNodeElement(nodeData);
            if (nodeEl) canvas.appendChild(nodeEl);
        }
    });

    activeWorkflow.connections.forEach(conn => drawConnection(conn.from, conn.to, false));

    Object.values(activeWorkflow.nodes).forEach(node => {
        const outgoingCount = activeWorkflow.connections.filter(c => c.from === node.id).length;
        const nodeEl = document.querySelector(`.workflow-node[data-node-id="${node.id}"]`);
        if (!nodeEl) return;
        
        const moduleInfo = getModuleInfoByType(node.type);
        const isRouter = moduleInfo && moduleInfo.type === 'router';

        if (isRouter) {
            if (outgoingCount < 2) {
                const btnCount = 2 - outgoingCount;
                for (let i = 0; i < btnCount; i++) {
                    const addBtn = createAddNodeButton(node.id);
                    const yOffset = (outgoingCount + i) === 0 ? -30 : 70;
                    addBtn.style.left = `${node.position.x + 150}px`;
                    addBtn.style.top = `${node.position.y + yOffset}px`;
                    canvas.appendChild(addBtn);
                    drawConnection(node.id, addBtn, true);
                }
            }
        } else {
            if (outgoingCount === 0) {
                const addBtn = createAddNodeButton(node.id);
                addBtn.style.left = `${node.position.x + 150}px`;
                addBtn.style.top = `${node.position.y + 23}px`;
                canvas.appendChild(addBtn);
                drawConnection(node.id, addBtn, true);
            }
        }
    });
}

function getModuleInfoByType(type) {
    for (const appKey in AVAILABLE_MODULES) {
        const foundModule = AVAILABLE_MODULES[appKey].modules.find(m => m.type === type);
        if (foundModule) {
            return { ...foundModule, app: AVAILABLE_MODULES[appKey] };
        }
    }
    return null;
}

function createNodeElement(nodeData) {
    const moduleInfo = getModuleInfoByType(nodeData.type);
    if (!moduleInfo) return null;

    const nodeEl = document.createElement('div');
    nodeEl.className = `workflow-node ${nodeData.isTrigger ? 'trigger' : 'action'}`;
    nodeEl.dataset.nodeId = nodeData.id;
    nodeEl.style.left = `${nodeData.position.x}px`;
    nodeEl.style.top = `${nodeData.position.y}px`;
    nodeEl.style.position = 'absolute';
    
    const isConfigured = nodeData.isTrigger
        ? (activeWorkflow.triggerType === nodeData.type && !!activeWorkflow.triggerConfig && Object.keys(activeWorkflow.triggerConfig).length > 0)
        : (nodeData.config && Object.keys(nodeData.config).length > 0) || ['router'].includes(nodeData.type);
        
    nodeEl.innerHTML = `
        <div class="node-icon" style="background-color: ${moduleInfo.app.color};">
            ${moduleInfo.app.icon}
        </div>
        <div class="node-label">${moduleInfo.name}</div>
        <div class="node-config-status ${isConfigured ? 'configured' : 'not-configured'}"></div>
        <button class="delete-node-from-canvas-btn" title="Xóa khối này"><i class="fa-solid fa-trash-can"></i></button>
    `;
    return nodeEl;
}

function drawConnection(fromId, toElementOrId, isTemporary = false) {
    const fromEl = document.querySelector(`.workflow-node[data-node-id="${fromId}"]`);
    const toEl = (typeof toElementOrId === 'string') ? document.querySelector(`.workflow-node[data-node-id="${toElementOrId}"]`) : toElementOrId;
    
    if (fromEl && toEl) {
        try {
            const options = {
                color: 'rgba(156, 163, 175, 0.7)',
                size: 4,
                path: 'fluid',
                startSocket: 'right',
                endSocket: 'left',
            };
            if (isTemporary) {
                options.dash = { len: 8, gap: 4 };
                options.endPlug = 'behind';
            } else {
                options.endPlug = 'arrow1';
            }

            const line = new LeaderLine(fromEl, toEl, options);
            lines.push({line, from: fromId, to: (typeof toElementOrId === 'string' ? toElementOrId : toEl.dataset.nodeId) }); 
        } catch (e) {
            console.error("Lỗi vẽ LeaderLine:", e);
        }
    }
}

function createAddNodeButton(parentId) { const button = document.createElement('button'); button.className = 'add-node-button'; button.dataset.parentId = parentId || 'initial'; button.innerHTML = '<i class="fa-solid fa-plus"></i>'; if(parentId === 'initial') { button.classList.add('initial'); } return button; }
function repositionAllLines() { lines.forEach(l => { try { l.line.position(); } catch (e) {} }); }
function removeAllLines() { lines.forEach(l => l.line.remove()); lines = []; }
function deleteNodeFromWorkflow(event) { event.stopPropagation(); const nodeEl = event.target.closest('.workflow-node'); if (!nodeEl) return; const nodeIdToDelete = nodeEl.dataset.nodeId; const nodeData = activeWorkflow.nodes[nodeIdToDelete]; if (nodeData && nodeData.isTrigger) { activeWorkflow.triggerType = null; activeWorkflow.triggerConfig = null; } const incomingConnection = activeWorkflow.connections.find(c => c.to === nodeIdToDelete); const outgoingConnections = activeWorkflow.connections.filter(c => c.from === nodeIdToDelete); delete activeWorkflow.nodes[nodeIdToDelete]; activeWorkflow.connections = activeWorkflow.connections.filter(c => c.from !== nodeIdToDelete && c.to !== nodeIdToDelete); if (incomingConnection && outgoingConnections.length > 0) { outgoingConnections.forEach(outConn => { activeWorkflow.connections.push({ from: incomingConnection.from, to: outConn.to }); }); } renderWorkflowOnCanvas(); updateRunButtonVisibility(); }

// ==========================================================================
//  MODULE PICKER (MAKE.COM STYLE)
// ==========================================================================

function showModulePicker(buttonElement) {
    const pickerContainer = document.getElementById('module-picker-container');
    const popover = document.getElementById('module-picker-popover');
    
    pickerContainer.classList.remove('hidden');

    const rect = buttonElement.getBoundingClientRect();
    
    const popoverHeight = 450; 
    const popoverWidth = 400;

    let top = rect.bottom + 15;
    let left = rect.left + (rect.width / 2) - (popoverWidth / 2);

    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - 10 - popoverWidth;
    }
    if (top + popoverHeight > window.innerHeight - 10) {
        top = rect.top - popoverHeight - 15;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    
    showMainPickerView();
}

function hideModulePicker() {
    document.getElementById('module-picker-container').classList.add('hidden');
    currentAddButton = null;
}

function showMainPickerView() {
    document.getElementById('module-picker-main-view').classList.remove('hidden');
    document.getElementById('module-picker-detail-view').classList.add('hidden');
    document.getElementById('module-search-input').value = '';
    renderAppList();
    handleModuleSearch(); 
}

function handleModuleSearch() {
    const searchTerm = document.getElementById('module-search-input').value.toLowerCase();
    const mainViewIsActive = !document.getElementById('module-picker-main-view').classList.contains('hidden');
    
    if (mainViewIsActive) {
        document.querySelectorAll('#module-picker-list .module-item').forEach(item => {
            const name = item.querySelector('h4').textContent.toLowerCase();
            item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
        });
    } else {
        document.querySelectorAll('#module-picker-detail-list .module-detail-item').forEach(item => {
            const name = item.textContent.toLowerCase();
            item.style.display = name.includes(searchTerm) ? 'block' : 'none';
        });
    }
}

function renderAppList() {
    const listEl = document.getElementById('module-picker-list');
    listEl.innerHTML = '';
    const isTriggerStep = currentAddButton.dataset.parentId === 'initial';

    for (const appKey in AVAILABLE_MODULES) {
        const app = AVAILABLE_MODULES[appKey];
        const relevantModules = app.modules.filter(m => isTriggerStep ? m.isTrigger : !m.isTrigger);
        
        if (relevantModules.length > 0) {
            const item = document.createElement('div');
            item.className = 'module-item';
            item.dataset.appKey = appKey;
            item.innerHTML = `
                <div class="app-icon" style="background-color: ${app.color}">${app.icon}</div>
                <div class="module-item-info">
                    <h4>${app.name}</h4>
                </div>
            `;
            listEl.appendChild(item);
        }
    }
}

function handleAppSelection(appKey) {
    const app = AVAILABLE_MODULES[appKey];
    if (!app) return;

    document.getElementById('module-picker-main-view').classList.add('hidden');
    const detailView = document.getElementById('module-picker-detail-view');
    detailView.classList.remove('hidden');

    document.getElementById('detail-app-icon').innerHTML = app.icon;
    document.getElementById('detail-app-icon').style.backgroundColor = app.color;
    document.getElementById('detail-app-name').textContent = app.name;
    
    const detailList = document.getElementById('module-picker-detail-list');
    detailList.innerHTML = '';

    const isTriggerStep = currentAddButton.dataset.parentId === 'initial';
    const triggers = app.modules.filter(m => m.isTrigger);
    const actions = app.modules.filter(m => !m.isTrigger);

    if (isTriggerStep && triggers.length > 0) {
        detailList.innerHTML += `<h5>ĐIỂM KÍCH HOẠT (TRIGGERS)</h5>`;
        triggers.forEach(m => {
            detailList.innerHTML += `<div class="module-detail-item trigger" data-module-type="${m.type}">${m.name}</div>`;
        });
    }
    
    if (!isTriggerStep && actions.length > 0) {
        detailList.innerHTML += `<h5>HÀNH ĐỘNG (ACTIONS)</h5>`;
        actions.forEach(m => {
            detailList.innerHTML += `<div class="module-detail-item action" data-module-type="${m.type}">${m.name}</div>`;
        });
    }
}

function handleModuleSelection(moduleType) {
    const moduleInfo = getModuleInfoByType(moduleType);
    if (!moduleInfo) return;

    const newNodeId = `node-${Date.now()}`;
    const newNodeData = { id: newNodeId, type: moduleType, isTrigger: moduleInfo.isTrigger, config: {} };

    const parentId = currentAddButton.dataset.parentId;
    
    const btnRect = currentAddButton.getBoundingClientRect();
    const canvasRect = document.getElementById('automation-canvas').getBoundingClientRect();
    
    const xOnCanvas = (btnRect.left - canvasRect.left + (btnRect.width / 2)) / scale;
    const yOnCanvas = (btnRect.top - canvasRect.top + (btnRect.height / 2)) / scale;

    newNodeData.position = { x: xOnCanvas, y: yOnCanvas };
    
    activeWorkflow.nodes[newNodeId] = newNodeData;

    if (parentId !== 'initial') {
        activeWorkflow.connections.push({ from: parentId, to: newNodeId });
    }
    
    hideModulePicker();
    renderWorkflowOnCanvas();
    updateRunButtonVisibility();

    const NO_CONFIG_MODULES = ['manual', 'router'];
    if (NO_CONFIG_MODULES.includes(moduleType)) {
        if(moduleType === 'manual') {
            activeWorkflow.triggerType = 'manual';
            activeWorkflow.triggerConfig = {};
        }
        saveCurrentWorkflow(false);
        return; 
    }
    
    const newNodeElement = document.querySelector(`.workflow-node[data-node-id="${newNodeId}"]`);
    if (newNodeElement) {
        openConfigModalForNode(newNodeElement);
    }
}

// ==========================================================================
//  MODAL & CONFIGURATION LOGIC
// ==========================================================================

function openConfigModalForNode(nodeElement) {
    const nodeId = nodeElement.dataset.nodeId;
    const nodeState = activeWorkflow.nodes[nodeId];
    if (!nodeState) return;
    
    currentlyEditingNodeId = nodeId;

    if (nodeState.isTrigger) {
        openTriggerConfigModal(nodeElement);
    } else {
        openActionConfigModal(nodeElement);
    }
}

function openTriggerConfigModal(triggerNodeElement) {
    const nodeState = activeWorkflow.nodes[currentlyEditingNodeId];
    const moduleInfo = getModuleInfoByType(nodeState.type);
    if (!moduleInfo) return;

    const modal = document.getElementById('action-config-modal');
    const titleEl = document.getElementById('action-modal-title');
    const contentContainer = document.getElementById('action-config-content');
    
    titleEl.textContent = `Cấu hình: ${moduleInfo.name}`;
    modal.classList.add('modal-lg');
    contentContainer.innerHTML = ''; 

    let optionsHTML = '';
    const currentConfig = activeWorkflow.triggerConfig || {};

    switch (nodeState.type) {
        case 'schedule':
            optionsHTML = `<div class="form-group">...</div>`;
            break;
        case 'project-event':
            let projectOptions = currentUser.projects.map(p => 
                `<option value="${p.id}" ${currentConfig?.projectId === p.id ? 'selected' : ''}>${p.name}</option>`
            ).join('');
            optionsHTML = `<div class="form-group">...</div>`; 
            break;
        case 'drive-watch-files':
            optionsHTML = `<div class="form-group"><label for="config-folder-id">ID Thư mục Google Drive</label><input id="config-folder-id" type="text" name="folderId" value="${currentConfig?.folderId || ''}" placeholder="Dán ID thư mục vào đây" required class="config-input-field"></div>`;
            break;
        case 'webhook':
            const webhookUrl = `${API_BASE_URL}/webhook/${currentUser.id}/${activeWorkflow.id}`;
            optionsHTML = `<div class="form-group"><label>URL Webhook (Chỉ sao chép)</label><input type="text" value="${webhookUrl}" readonly class="config-input-field"></div>`;
            break;
        default:
            optionsHTML = '<p class="form-help-text">Điểm kích hoạt này không cần cấu hình thêm.</p>';
            break;
    }
    
    contentContainer.innerHTML = `
        <form id="trigger-config-form">
            <input type="hidden" id="action-node-id" value="${currentlyEditingNodeId}">
            <p class="form-help-text">${moduleInfo.desc}</p>
            ${optionsHTML}
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Lưu Cấu hình</button>
            </div>
        </form>
    `;

    modal.querySelector('#trigger-config-form').addEventListener('submit', handleTriggerFormSubmit);
    openModal('actionConfig');
}

function openActionConfigModal(nodeElement) {
    const nodeState = activeWorkflow.nodes[currentlyEditingNodeId];
    if (!nodeState || nodeState.isTrigger) return;

    const moduleInfo = getModuleInfoByType(nodeState.type);
    if (!moduleInfo) return;

    const modal = document.getElementById('action-config-modal');
    const titleEl = document.getElementById('action-modal-title');
    const contentContainer = document.getElementById('action-config-content');
    
    titleEl.textContent = `Cấu hình: ${moduleInfo.name}`;
    modal.classList.add('modal-lg');
    contentContainer.innerHTML = ''; 

    const schema = ACTION_CONFIG_SCHEMAS[nodeState.type];

    contentContainer.innerHTML = `
        <form id="action-config-form">
            <input type="hidden" id="action-node-id" value="${currentlyEditingNodeId}">
            <div id="operation-panel"></div>
            <div id="preview-output-container" class="hidden">
                <h4>Kết quả chạy thử</h4>
                <div id="preview-loader" class="loader-container hidden"><div class="loader"></div></div>
                <pre id="preview-output" class="json-preview"></pre>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary run-test-btn"><i class="fas fa-play"></i> Chạy thử khối này</button>
                <button type="submit" class="btn btn-primary">Lưu Cấu hình</button>
            </div>
        </form>
    `;

    const operationPanel = contentContainer.querySelector('#operation-panel');
    
    if (!schema) {
        operationPanel.innerHTML = `<p class="form-help-text">Hành động này không cần cấu hình.</p>`;
    } else {
        renderFormFields(operationPanel, schema, nodeState.config);
    }
    
    modal.querySelector('#action-config-form').addEventListener('submit', handleActionFormSubmit);
    modal.querySelector('.run-test-btn').addEventListener('click', handleRunTestNode);
    openModal('actionConfig');
}

function getIncomingNodesData(nodeId) {
    const incomingData = {};
    const connectionsToThisNode = activeWorkflow.connections.filter(c => c.to === nodeId);
    
    connectionsToThisNode.forEach(conn => {
        const parentNodeId = conn.from;
        const parentNode = activeWorkflow.nodes[parentNodeId];
        if(parentNode) {
            const moduleInfo = getModuleInfoByType(parentNode.type);
            incomingData[parentNodeId] = {
                name: moduleInfo.name,
                output: generateMockOutput(parentNode.type)
            };
        }
    });
    return incomingData;
}

function generateMockOutput(nodeType) {
    switch(nodeType) {
        case 'manual':
        case 'webhook':
            return { body: { key: 'value' }, headers: { 'content-type': 'application/json' } };
        case 'project-event':
            return { task: { id: 'task_123', title: 'Thiết kế Giao diện Mới', status: 'Đang Làm' }};
        case 'ai-agent':
            return { generatedText: 'Đây là nội dung do AI tạo ra.', imageUrl: 'https://example.com/image.png' };
        case 'web-scraper':
             return { generatedText: 'Tóm tắt nội dung trang web...' };
        default:
            return { value: `data_from_${nodeType}` };
    }
}


function openExpressionEditor(buttonElement) {
    let popover = document.getElementById('expression-popover');
    
    const incomingData = getIncomingNodesData(currentlyEditingNodeId);
    let html = '<h4><i class="fas fa-code"></i> Dữ liệu có sẵn</h4>';
    
    if(Object.keys(incomingData).length === 0) {
        html += '<div class="expression-item">Không có biến nào từ các khối trước.</div>';
    } else {
        for (const nodeId in incomingData) {
            const nodeInfo = incomingData[nodeId];
            html += `<div class="expression-category">Từ khối: ${nodeInfo.name}</div>`;
            for (const key in nodeInfo.output) {
                if(typeof nodeInfo.output[key] === 'object' && nodeInfo.output[key] !== null) {
                     for (const subKey in nodeInfo.output[key]) {
                        const subPath = `${nodeId}.${key}.${subKey}`;
                        html += `<div class="expression-item" data-value="{{${subPath}}}"><strong>${subKey}:</strong> <span>${nodeInfo.output[key][subKey]}</span></div>`;
                     }
                } else {
                    const path = `${nodeId}.${key}`;
                    html += `<div class="expression-item" data-value="{{${path}}}"><strong>${key}:</strong> <span>${nodeInfo.output[key]}</span></div>`;
                }
            }
        }
    }
    
    popover.innerHTML = html;
    
    const rect = buttonElement.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;
    popover.classList.add('active');
}


async function handleActionFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const nodeId = form.querySelector('#action-node-id')?.value || currentlyEditingNodeId;
    
    if (!nodeId) {
        showToast("Lỗi: Không xác định được khối nào để lưu.", "error");
        return;
    }

    const nodeState = activeWorkflow.nodes[nodeId];
    if (!nodeState) {
        showToast(`Lỗi: Không tìm thấy khối với ID ${nodeId} trong quy trình.`, "error");
        return;
    }

    const formData = new FormData(form);
    const newConfig = {};
    for (let [key, value] of formData.entries()) {
        if (key !== 'action-node-id') {
           newConfig[key] = value;
        }
    }

    nodeState.config = newConfig;
    
    renderWorkflowOnCanvas();
    closeModal();
    showToast('Đã lưu cấu hình khối hành động.', 'success');
}

async function handleTriggerFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const nodeId = form.querySelector('#action-node-id').value;
    const nodeState = activeWorkflow.nodes[nodeId];

    if (!nodeState || !nodeState.isTrigger) return;
    
    const formData = new FormData(form);
    const newConfig = {};
    for (let [key, value] of formData.entries()) {
        if (key !== 'action-node-id') {
            newConfig[key] = value;
        }
    }
    
    if (nodeState.type === 'project-event') newConfig.event = 'task-moved';
    else if (nodeState.type === 'calendar-event') newConfig.event = 'event-created';

    activeWorkflow.triggerConfig = newConfig;

    showToast("Đã lưu cấu hình điểm kích hoạt.", "success");
    closeModal();
    renderWorkflowOnCanvas();
    updateRunButtonVisibility();
}

async function handleRunTestNode(e) {
    const form = e.target.closest('form');
    const previewContainer = form.querySelector('#preview-output-container');
    const previewOutput = form.querySelector('#preview-output');
    const loader = form.querySelector('#preview-loader');

    previewContainer.classList.remove('hidden');
    loader.classList.remove('hidden');
    previewOutput.textContent = '';
    previewOutput.style.color = 'var(--text-color)';

    const nodeId = form.querySelector('#action-node-id').value;
    const nodeState = activeWorkflow.nodes[nodeId];

    const formData = new FormData(form);
    const currentConfig = {};
    for (let [key, value] of formData.entries()) {
        if (key !== 'action-node-id') {
            currentConfig[key] = value;
        }
    }
    
    try {
        const result = await fetchWithAuth('/api/workflow/node/preview', {
            method: 'POST',
            body: JSON.stringify({ nodeType: nodeState.type, nodeConfig: currentConfig })
        });
        
        if (result.previewResult.imageUrl) {
            previewOutput.innerHTML = `<img src="${result.previewResult.imageUrl}" alt="Kết quả tạo ảnh">`;
        } else {
            previewOutput.textContent = JSON.stringify(result.previewResult, null, 2);
        }

    } catch (error) {
        previewOutput.textContent = `Lỗi: ${error.message}`;
        previewOutput.style.color = 'var(--error-color)';
    } finally {
        loader.classList.add('hidden');
    }
}

function handleAiActionChange(event) {
    const selectedAction = event.target.value;
    const form = event.target.closest('form');
    
    form.querySelectorAll('.dynamic-field').forEach(el => el.remove());

    let newFields = [];
    if (selectedAction === 'generate-text') {
        newFields = [
             { name: 'prompt', label: 'Yêu cầu cho AI', type: 'textarea', rows: 10, placeholder: 'Ví dụ: Tóm tắt văn bản sau đây: {{node_1.text}}', required: true }
        ];
    } else if (selectedAction === 'generate-image') {
        newFields = [
            { name: 'prompt', label: 'Mô tả hình ảnh', type: 'textarea', rows: 5, placeholder: 'Ví dụ: một phi hành gia đang cưỡi ngựa trên sao Hỏa', required: true },
            { name: 'style', label: 'Phong cách nghệ thuật', type: 'select', required: true, options: [
                { value: 'none', text: 'Mặc định (Không có)' }, { value: 'photographic', text: 'Nhiếp ảnh' }, { value: 'cinematic', text: 'Điện ảnh' },
                { value: 'digital-art', text: 'Nghệ thuật số' }, { value: 'anime', text: 'Anime' }, { value: 'fantasy-art', text: 'Nghệ thuật kỳ ảo' },
                { value: 'comic-book', text: 'Truyện tranh' },
            ]}
        ];
    }
    
    renderFormFields(form, newFields, {}, true);
}


function renderFormFields(container, schema, currentConfig = {}, append = false) {
    if (!append) {
        container.innerHTML = '';
    }
    schema.forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        if(append) {
             formGroup.classList.add('dynamic-field');
        }
        
        let fieldHTML = `<label for="config-${field.name}">${field.label}</label>`;
        const currentValue = currentConfig?.[field.name] || '';

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'input-wrapper';
        
        let inputElement;
        switch (field.type) {
            case 'file':
                inputElement = document.createElement('input');
                inputElement.type = 'file';
                inputElement.accept = ".xlsx, .xls";
                inputElement.addEventListener('change', handleExcelUpload);
                break;
            case 'textarea':
                inputElement = document.createElement('textarea');
                inputElement.rows = field.rows || 3;
                break;
            case 'select':
                inputElement = document.createElement('select');
                inputElement.innerHTML = field.options.map(opt => `<option value="${opt.value}" ${currentValue === opt.value ? 'selected' : ''}>${opt.text}</option>`).join('');
                if (field.onChange) {
                    inputElement.addEventListener('change', window[field.onChange]);
                }
                break;
            default:
                inputElement = document.createElement('input');
                inputElement.type = field.type || 'text';
                break;
        }

        inputElement.id = `config-${field.name}`;
        inputElement.name = field.name;
        if(field.placeholder) inputElement.placeholder = field.placeholder;
        if (field.required) inputElement.required = true;
        if (field.readonly) inputElement.readOnly = true;
        inputElement.value = currentValue;
        inputElement.classList.add('config-input-field');

        inputWrapper.appendChild(inputElement);

        formGroup.innerHTML = fieldHTML;
        formGroup.appendChild(inputWrapper);
        container.appendChild(formGroup);

        if(field.onChange) {
            inputElement.dispatchEvent(new Event('change'));
        }
    });
}

function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const emails = [];
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for(let i = 0; i < json.length; i++) {
            for(let j = 0; j < json[i].length; j++) {
                const cellValue = String(json[i][j]);
                if (emailRegex.test(cellValue)) {
                    emails.push(cellValue);
                }
            }
        }
        
        const recipientsTextarea = document.querySelector('textarea[name="recipients"]');
        if (recipientsTextarea) {
            recipientsTextarea.value = emails.join('; ');
            showToast(`Đã tìm thấy và thêm ${emails.length} email từ tệp.`, 'success');
        }
    };
    reader.onerror = () => {
        showToast('Không thể đọc tệp Excel.', 'error');
    };
    reader.readAsArrayBuffer(file);
}