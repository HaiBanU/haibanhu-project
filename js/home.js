function renderMyTasks() {
    const container = document.getElementById('my-tasks-list');
    if (!container) return;

    if (!currentUser || !currentUser.projects || currentUser.projects.length === 0) {
        container.innerHTML = '<p class="no-data-message">Bạn chưa có công việc nào được giao.</p>';
        return;
    }

    const myTasks = [];
    const myName = currentUser.name.toLowerCase();

    currentUser.projects.forEach(project => {
        if (project.tasks && project.tasks.length > 0) {
            project.tasks.forEach(task => {
                const assignees = (task.assignee || '').split(',').map(name => name.trim().toLowerCase());
                if (assignees.includes(myName) && task.status !== 'Đã Hoàn Thành' && task.status !== 'DOCS') {
                    myTasks.push({
                        ...task,
                        projectName: project.name,
                        projectId: project.id
                    });
                }
            });
        }
    });

    if (myTasks.length === 0) {
        container.innerHTML = '<p class="no-data-message">Tuyệt vời! Bạn không có công việc nào cần làm.</p>';
        return;
    }
    
    myTasks.sort((a, b) => {
        const today = new Date().setHours(0, 0, 0, 0);
        const aDueDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDueDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        
        const aIsOverdue = aDueDate < today;
        const bIsOverdue = bDueDate < today;

        if (aIsOverdue && !bIsOverdue) return -1;
        if (!aIsOverdue && bIsOverdue) return 1;

        return aDueDate - bDueDate;
    });

    container.innerHTML = '';
    myTasks.forEach(task => {
        const card = document.createElement('a');
        card.className = 'my-task-card';
        card.href = `/page/projects.html?viewProject=${task.projectId}&openTask=${task.id}`; 
        
        let deadlineHTML = '';
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            
            let cls = '';
            let text = '';

            if (diffDays < 0) {
                cls = 'overdue';
                text = `Quá hạn ${Math.abs(diffDays)} ngày`;
            } else if (diffDays === 0) {
                cls = 'due-soon';
                text = 'Hạn hôm nay';
            } else if (diffDays <= 7) {
                cls = 'due-soon';
                text = `Còn ${diffDays} ngày`;
            } else {
                text = `Hạn: ${dueDate.toLocaleDateString('vi-VN')}`;
            }
            deadlineHTML = `<span class="task-deadline ${cls}">${text}</span>`;
        }

        card.innerHTML = `
            <div class="task-info">
                <span class="task-title">${task.title}</span>
                <span class="project-name-badge">${task.projectName}</span>
            </div>
            <div class="task-meta">
                ${deadlineHTML}
            </div>
        `;
        container.appendChild(card);
    });
}

async function renderTodayEvents() {
    const container = document.getElementById('today-events-list');
    if (!container) return;

    try {
        const allEvents = await fetchWithAuth('/api/calendar/events');
        
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        const upcomingTodayEvents = allEvents
            .filter(event => {
                const eventStart = new Date(event.start);
                return eventStart >= startOfDay && eventStart <= endOfDay;
            })
            .sort((a, b) => new Date(a.start) - new Date(b.start));

        if (upcomingTodayEvents.length === 0) {
            container.innerHTML = '<p class="no-data-message">Hôm nay bạn không có lịch trình nào.</p>';
            return;
        }

        container.innerHTML = '';
        upcomingTodayEvents.forEach(event => {
            const item = document.createElement('div');
            item.className = 'event-item';
            
            const eventStart = new Date(event.start);
            let timeString;

            if (event.allDay) {
                timeString = "Cả ngày";
            } else {
                const eventEnd = event.end ? new Date(event.end) : null;
                const startTime = eventStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                const endTime = eventEnd ? eventEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
                timeString = endTime ? `${startTime} - ${endTime}` : startTime;
            }

            item.innerHTML = `
                <div class="event-time">${timeString}</div>
                <div class="event-details">
                    <span class="event-title">${event.title}</span>
                </div>
            `;
            container.appendChild(item);
        });

    } catch (error) {
        console.error("Lỗi khi tải lịch trình:", error);
        container.innerHTML = '<p class="no-data-message">Không thể tải lịch trình.</p>';
    }
}


// <<< START CẬP NHẬT: Chia bảng tin theo từng dự án >>>
function renderProjectFeed() {
    const container = document.getElementById('project-feed-list');
    if (!container) return;

    const projectsWithComments = (currentUser.projects || [])
        .map(p => ({
            ...p,
            comments: (p.comments || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        }))
        .filter(p => p.comments.length > 0)
        .sort((a, b) => new Date(b.comments[0].createdAt) - new Date(a.comments[0].createdAt));

    if (projectsWithComments.length === 0) {
        container.innerHTML = '<p class="no-data-message">Chưa có hoạt động nào trong các dự án của bạn.</p>';
        return;
    }
    
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(350px, 1fr))';
    container.style.gap = '20px';
    container.innerHTML = '';

    projectsWithComments.forEach(project => {
        const projectCard = document.createElement('div');
        projectCard.className = 'project-feed-card';

        let commentsHTML = '';
        const recentComments = project.comments.slice(0, 3); 

        recentComments.forEach(comment => {
            const author = findUserById(comment.author);
            if (!author) return;

            const timeAgo = (date) => {
                const seconds = Math.floor((new Date() - new Date(date)) / 1000);
                if (seconds < 5) return "Vừa xong";
                let interval = seconds / 31536000;
                if (interval > 1) return Math.floor(interval) + " năm trước";
                interval = seconds / 2592000;
                if (interval > 1) return Math.floor(interval) + " tháng trước";
                interval = seconds / 86400;
                if (interval > 1) return Math.floor(interval) + " ngày trước";
                interval = seconds / 3600;
                if (interval > 1) return Math.floor(interval) + " giờ trước";
                interval = seconds / 60;
                if (interval > 1) return Math.floor(interval) + " phút trước";
                return Math.floor(seconds) + " giây trước";
            };

            const avatarHTML = author.avatar ? `<img src="${author.avatar}" alt="${author.name}">` : author.name.charAt(0).toUpperCase();

            commentsHTML += `
                <div class="feed-card-comment-item">
                    <div class="feed-item-avatar small">${avatarHTML}</div>
                    <div class="feed-item-content">
                        <div class="feed-item-header">
                            <span class="feed-item-author">${author.name}</span>
                            <span class="feed-item-meta">${timeAgo(comment.createdAt)}</span>
                        </div>
                        <div class="feed-item-body">
                           <p>${comment.text || '<i>Đã gửi một tệp đính kèm</i>'}</p>
                        </div>
                    </div>
                </div>`;
        });
        
        // <<< SỬA LỖI ĐIỀU HƯỚNG TẠI ĐÂY >>>
        projectCard.innerHTML = `
            <a href="/page/projects.html?viewProject=${project.id}" class="project-feed-card-header">
                <h3>${project.name}</h3>
                <i class="fas fa-arrow-right"></i>
            </a>
            <div class="project-feed-card-body">
                ${commentsHTML}
            </div>
        `;
        container.appendChild(projectCard);
    });
}
// <<< END CẬP NHẬT >>>

function initializeHomePage() {
    renderMyTasks();
    renderTodayEvents();
    renderProjectFeed();
}