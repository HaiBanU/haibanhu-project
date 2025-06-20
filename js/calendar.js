// --- File: calendar.js (Bản cập nhật đầy đủ) ---

let calendar; 
let currentSelectionInfo = null;

function formatDateForInput(date) {
    if (!date) return { date: '', time: '' };
    const d = new Date(date);
    const dateString = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const timeString = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return { date: dateString, time: timeString };
}

function openEventModal(data) {
    const modal = document.getElementById('event-modal');
    const form = document.getElementById('event-form');
    const titleEl = document.getElementById('event-title-input');
    const descEl = document.getElementById('event-description-input');
    const idEl = document.getElementById('event-id-input');
    const deleteBtn = document.getElementById('delete-event-btn');
    const allDayCheckbox = document.getElementById('event-allday-checkbox');
    const timeInputsContainer = document.getElementById('time-inputs-start');

    form.reset();
    idEl.value = '';

    const start = new Date(data.start);
    const end = data.end ? new Date(data.end) : new Date(start.getTime() + 60*60*1000);
    
    const formattedStart = formatDateForInput(start);
    const formattedEnd = formatDateForInput(end);

    document.getElementById('event-start-date-input').value = formattedStart.date;
    document.getElementById('event-start-time-input').value = formattedStart.time;
    document.getElementById('event-end-time-input').value = formattedEnd.time;

    allDayCheckbox.checked = data.allDay;
    timeInputsContainer.classList.toggle('hidden', data.allDay);
    
    if (data.id) {
        document.getElementById('event-modal-title').textContent = "Chỉnh sửa sự kiện";
        idEl.value = data.id;
        titleEl.value = data.title;
        descEl.value = data.description || '';
        deleteBtn.classList.remove('hidden');
    } else {
        document.getElementById('event-modal-title').textContent = "Tạo sự kiện";
        if (data.jsEvent) {
            titleEl.value = 'Thời gian tập trung';
        } else {
            titleEl.value = '';
        }
        descEl.value = '';
        deleteBtn.classList.add('hidden');
    }
    
    openModal('event');
}

async function handleEventFormSubmit(e) {
    e.preventDefault();

    const eventId = document.getElementById('event-id-input').value;
    const title = document.getElementById('event-title-input').value;
    const description = document.getElementById('event-description-input').value;
    const isAllDay = document.getElementById('event-allday-checkbox').checked;

    const startDateStr = document.getElementById('event-start-date-input').value;
    const startTimeStr = document.getElementById('event-start-time-input').value;
    const endTimeStr = document.getElementById('event-end-time-input').value;

    if (!title || !startDateStr) {
        showToast("Vui lòng nhập tiêu đề và ngày bắt đầu.", "error");
        return;
    }
    
    let start, end;

    const dateParts = startDateStr.split('-').map(Number);

    if (isAllDay) {
        start = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        end = null;
    } else {
        const startTimeParts = startTimeStr.split(':').map(Number);
        const endTimeParts = endTimeStr.split(':').map(Number);
        start = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], startTimeParts[0], startTimeParts[1]);
        end = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], endTimeParts[0], endTimeParts[1]);
    }

    const eventData = { title, description, start, end, allDay: isAllDay };

    try {
        const url = eventId ? `/api/calendar/events/${eventId}` : '/api/calendar/events';
        const method = eventId ? 'PUT' : 'POST';

        await fetchWithAuth(url, {
            method: method,
            body: JSON.stringify(eventData),
        });
        
        calendar.refetchEvents();
        closeModal();
        showToast('Đã lưu sự kiện thành công!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleDeleteEvent() {
    const eventId = document.getElementById('event-id-input').value;
    if (!eventId) return;

    const confirmed = await showConfirmationModal("Bạn có chắc chắn muốn xóa sự kiện này không?");
    if (!confirmed) return;

    try {
        await fetchWithAuth(`/api/calendar/events/${eventId}`, {
            method: 'DELETE',
        });
        calendar.refetchEvents();
        closeModal();
        showToast('Đã xóa sự kiện.', 'info');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function initializeCalendarPage() {
    const calendarEl = document.getElementById('calendar');
    const miniCalendarEl = document.getElementById('mini-calendar');
    const mainCalendarTitleEl = document.getElementById('calendar-title');
    const miniCalendarTitleEl = document.getElementById('mini-calendar-title');

    if (!calendarEl || !miniCalendarEl || !mainCalendarTitleEl || !miniCalendarTitleEl) return;
    
    const mainCalendar = new FullCalendar.Calendar(calendarEl, {
        themeSystem: 'standard',
        locale: 'vi',
        headerToolbar: false,
        initialView: 'timeGridWeek',
        navLinks: true,
        editable: true,
        selectable: true,
        dayMaxEvents: true,
        nowIndicator: true, // Bật chỉ báo thời gian hiện tại
        allDaySlot: false,  // <<< THAY ĐỔI: Ẩn dòng "all-day"
        
        scrollTime: "08:00:00",

        slotDuration: '00:30:00',
        // <<< THAY ĐỔI: Định dạng lại giờ và header >>>
        slotLabelFormat: { 
            hour: 'numeric',
            meridiem: 'short' // Hiển thị AM/PM
        },
        dayHeaderContent: (arg) => {
            const dayOfWeek = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(arg.date).toUpperCase();
            const dayOfMonth = arg.date.getDate();
            const isTodayClass = arg.isToday ? 'fc-day-today' : '';
            return {
                html: `
                    <div class="fc-day-header-custom-wrapper">
                        <span class="fc-day-header-day">${dayOfWeek}</span>
                        <span class="fc-day-header-date ${isTodayClass}">${dayOfMonth}</span>
                    </div>
                `
            };
        },

        datesSet: (dateInfo) => {
            mainCalendarTitleEl.textContent = dateInfo.view.title;
            miniCalendar.gotoDate(dateInfo.start);
        },
        select: (selectionInfo) => {
            openEventModal(selectionInfo);
        },
        eventClick: (clickInfo) => {
            openEventModal({
                id: clickInfo.event.id,
                title: clickInfo.event.title,
                start: clickInfo.event.start,
                end: clickInfo.event.end,
                allDay: clickInfo.event.allDay,
                description: clickInfo.event.extendedProps.description
            });
        },
        events: (fetchInfo, successCallback, failureCallback) => {
            fetchWithAuth('/api/calendar/events')
                .then(events => successCallback(events))
                .catch(error => failureCallback(error));
        }
    });

    calendar = mainCalendar;

    const miniCalendar = new FullCalendar.Calendar(miniCalendarEl, {
        locale: 'vi',
        initialView: 'dayGridMonth',
        headerToolbar: false,
        datesSet: (dateInfo) => { miniCalendarTitleEl.textContent = dateInfo.view.title; },
        dateClick: (arg) => { mainCalendar.gotoDate(arg.date); }
    });

    mainCalendar.render();
    miniCalendar.render();

    document.getElementById('btn-today').addEventListener('click', () => mainCalendar.today());
    document.getElementById('btn-prev').addEventListener('click', () => mainCalendar.prev());
    document.getElementById('btn-next').addEventListener('click', () => mainCalendar.next());
    document.getElementById('view-switcher').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        document.getElementById('view-switcher').querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
        mainCalendar.changeView(target.dataset.view);
    });
    document.getElementById('mini-btn-prev').addEventListener('click', () => miniCalendar.prev());
    document.getElementById('mini-btn-next').addEventListener('click', () => miniCalendar.next());
    
    document.getElementById('event-form').addEventListener('submit', handleEventFormSubmit);
    document.getElementById('delete-event-btn').addEventListener('click', handleDeleteEvent);
    document.getElementById('create-event-btn').addEventListener('click', () => {
        const now = new Date();
        openEventModal({
            start: now,
            end: new Date(now.getTime() + 60 * 60 * 1000),
            allDay: false
        });
    });
    document.getElementById('event-allday-checkbox').addEventListener('change', (e) => {
        document.getElementById('time-inputs-start').classList.toggle('hidden', e.target.checked);
    });

    const sidebar = document.getElementById('right-sidebar');
    if (sidebar) {
        sidebar.addEventListener('transitionend', () => {
            setTimeout(() => {
                if (calendar) {
                    calendar.updateSize();
                }
            }, 50);
        });
    }
}