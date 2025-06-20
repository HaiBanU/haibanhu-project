// --- File: server.js (Bản cập nhật cuối cùng, đơn giản và hiệu quả) ---

require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const axios =require('axios');
const { OAuth2Client } = require('google-auth-library');
const { Buffer } = require('buffer');
const crypto = require('crypto');
const nanoid = () => crypto.randomBytes(4).toString('hex');
const bodyParser = require('body-parser');
const cheerio = require('cheerio');

const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// THAY THẾ Ở ĐÂY
// Thay thế `<TÊN-USER-GITHUB-CỦA-BẠN>` bằng username GitHub thực của bạn.
const allowedOrigins = [
    'http://127.0.0.1:5500', 
    'http://localhost:5500',
    'https://<HaiBanU>.github.io' 
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE"]
};

app.use(cors(corsOptions));

const io = new Server(server, {
    cors: corsOptions
});
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, GROQ_API_KEY, MONGODB_URI, STABILITY_API_KEY } = process.env;

if (!GROQ_API_KEY || !JWT_SECRET || !MONGODB_URI || !STABILITY_API_KEY) {
    console.error("LỖI NGHIÊM TRỌNG: Thiếu các biến môi trường quan trọng.");
    process.exit(1);
}

const VIETNAMESE_SYSTEM_PROMPT = "Bạn là HaiBanhU, một trợ lý AI thông minh, thân thiện và hữu ích. BẠN PHẢI LUÔN LUÔN TRẢ LỜI BẰNG TIẾNG VIỆT. Giữ giọng văn tự nhiên, chuyên nghiệp nhưng gần gũi. Tuyệt đối không sử dụng tiếng Anh hoặc bất kỳ ngôn ngữ nào khác, trừ khi người dùng yêu cầu dịch một cách rõ ràng.";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');

function sanitizeUserForSession(userObject) {
    if (!userObject) return null;
    const sanitizedUser = JSON.parse(JSON.stringify(userObject));

    if (sanitizedUser.projects && Array.isArray(sanitizedUser.projects)) {
        sanitizedUser.projects.forEach(project => {
            if (project.tasks && Array.isArray(project.tasks)) {
                project.tasks.forEach(task => {
                    if (task.attachment && task.attachment.data) {
                        delete task.attachment.data;
                    }
                });
            }
            if (project.comments && Array.isArray(project.comments)) {
                project.comments.forEach(comment => {
                     if (comment.attachment && comment.attachment.data) {
                        delete comment.attachment.data;
                    }
                });
            }
        });
    }
    return sanitizedUser;
}


// --- Schemas & Models ---
const MessageSchema = new mongoose.Schema({ sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, text: { type: String, required: true }, }, { timestamps: true });
const ConversationSchema = new mongoose.Schema({ participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], messages: [MessageSchema] }, { timestamps: true });
const Conversation = mongoose.model('Conversation', ConversationSchema);

const TaskSchema = new mongoose.Schema({
    id: { type: String, default: () => String(Date.now()) },
    title: String,
    status: String,
    description: String,
    dueDate: Date,
    assignee: String,
    completedOn: Date,
    attachment: mongoose.Schema.Types.Mixed,
    grade: { type: Number, min: 0, max: 100 },
    createdAt: Date,
    updatedAt: Date
});

const DocumentSchema = new mongoose.Schema({ title: { type: String, required: true }, content: { type: mongoose.Schema.Types.Mixed }, projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } }, { timestamps: true });
const Document = mongoose.model('Document', DocumentSchema);

const CommentSchema = new mongoose.Schema({
    text: { type: String },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attachment: mongoose.Schema.Types.Mixed,
}, { timestamps: true });


const ProjectSchema = new mongoose.Schema({ 
    id: { type: String, default: () => String(Date.now()) }, 
    name: String, 
    description: String, 
    deadline: Date, 
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
    tasks: [TaskSchema], 
    inviteCode: { type: String, default: () => nanoid(8) },
    comments: [CommentSchema]
});

const WorkflowSchema = new mongoose.Schema({ 
    id: { type: String, default: () => String(Date.now()) }, 
    name: String, 
    nodes: mongoose.Schema.Types.Mixed, 
    connections: mongoose.Schema.Types.Mixed, 
    lastRunStatus: String,
    triggerType: { type: String, default: 'manual' },
    triggerConfig: {
        projectId: String,
        event: String,
        columnStatus: String
    }
});

const EventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date },
    allDay: { type: Boolean, default: false },
    description: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, toJSON: { transform: function(doc, ret) { ret.id = ret._id.toHexString(); delete ret._id; delete ret.__v; } } });
const Event = mongoose.model('Event', EventSchema);

const UserSchema = new mongoose.Schema({ 
    name: { type: String, required: true }, 
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 6 }, 
    email: { type: String, default: null }, 
    password: { type: String }, 
    avatar: String, 
    bio: String, 
    skills: [String], 
    title: { type: String, default: '' },
    profileType: { type: String, default: 'freelancer' }, 
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
    friendRequests: [{ from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, status: { type: String, default: 'pending' } }], 
    projectInvites: [{ from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, projectId: String, projectName: String, status: { type: String, default: 'pending' } }], 
    connections: { gmail: { name: String, connected: Boolean, appPassword: String } }, 
    projects: [ProjectSchema], 
    workflows: [WorkflowSchema] 
}, { timestamps: true, toJSON: { virtuals: true, transform: function(doc, ret) { delete ret._id; delete ret.__v; delete ret.password; } } });

UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
UserSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
UserSchema.virtual('id').get(function() { return this._id.toHexString(); });
const User = mongoose.model('User', UserSchema);

mongoose.connect(MONGODB_URI).then(() => console.log('✅ Kết nối MongoDB thành công!')).catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));
function encodePassword(password) { return Buffer.from(password).toString('base64'); }
function generateToken(user) { return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' }); }
const authenticateToken = (req, res, next) => { const authHeader = req.headers['authorization']; const token = authHeader && authHeader.split(' ')[1]; if (token == null) return res.sendStatus(401); jwt.verify(token, JWT_SECRET, (err, user) => { if (err) return res.sendStatus(403); req.user = user; next(); }); };

// --- API Routes ---
app.post('/api/auth/register', async (req, res) => { try { const { name, username, password } = req.body; if (!name || !username || !password) { return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin." }); } if (username.length < 6) { return res.status(400).json({ message: "Tên tài khoản phải có ít nhất 6 ký tự." }); } const existingUsername = await User.findOne({ username: username.toLowerCase() }); if (existingUsername) { return res.status(409).json({ message: "Tên tài khoản này đã được sử dụng." }); } const existingName = await User.findOne({ name: name }); if (existingName) { return res.status(409).json({ message: "Tên của bạn đã có người dùng. Vui lòng tạo tên khác." }); } const newUser = new User({ name, username: username.toLowerCase(), password: encodePassword(password), skills: [], friends: [], friendRequests: [], projectInvites: [], projects: [], workflows: [] }); await newUser.save(); const token = generateToken(newUser); res.status(201).json({ message: "Tạo tài khoản thành công!", token, user: sanitizeUserForSession(newUser.toJSON()) }); } catch (error) { if (error.name === 'ValidationError') { return res.status(400).json({ message: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại." }); } console.error("Register Error:", error); res.status(500).json({ message: "Lỗi server khi đăng ký." }); } });
app.post('/api/auth/login', async (req, res) => { try { const { username, password } = req.body; if (!username || !password) { return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin." }); } const user = await User.findOne({ username: username.toLowerCase() }); if (!user || user.password !== encodePassword(password)) { return res.status(401).json({ message: "Tên tài khoản hoặc mật khẩu không chính xác." }); } const token = generateToken(user); res.status(200).json({ message: "Đăng nhập thành công!", token, user: sanitizeUserForSession(user.toJSON()) }); } catch (error) { console.error("Login Error:", error); res.status(500).json({ message: "Lỗi server khi đăng nhập." }); } });

app.put('/api/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const updateData = req.body;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng." });
        }

        if (updateData.projects && Array.isArray(updateData.projects)) {
            updateData.projects.forEach(project => {
                if (!project.inviteCode) {
                    project.inviteCode = nanoid(8);
                }
                if (project.comments && Array.isArray(project.comments)) {
                    project.comments.forEach(comment => {
                        if (comment.author && typeof comment.author === 'object') {
                            comment.author = comment.author._id || comment.author.id;
                        }
                    });
                }
            });
        }

        user.set(updateData);

        if (updateData.password) {
            user.password = encodePassword(updateData.password);
        }

        const updatedUser = await user.save();
        
        res.status(200).json({
            message: "Cập nhật thành công!",
            user: sanitizeUserForSession(updatedUser.toJSON())
        });

    } catch (error) {
        console.error("Lỗi cập nhật người dùng:", error);
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ message: `Lỗi dữ liệu: ${error.message}` });
        }
        res.status(500).json({ message: "Lỗi server khi cập nhật." });
    }
});


// <<< START SỬA LỖI & CẬP NHẬT: Xóa bỏ populate không cần thiết >>>
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        // Lấy dữ liệu người dùng "thô", không populate comment author
        const users = await User.find({});
        res.json(users.map(u => u.toJSON())); // Không cần sanitize nữa vì không có dữ liệu nhị phân
    } catch (error) {
        res.status(500).json({ message: "Lỗi server khi lấy danh sách người dùng." });
    }
});
// <<< END SỬA LỖI & CẬP NHẬT >>>


app.post('/api/user/connect/google', authenticateToken, async (req, res) => { try { const { code } = req.body; if (!code) { return res.status(400).json({ message: 'Không nhận được mã code từ frontend.' }); } const user = await User.findById(req.user.userId); if (!user) { return res.status(404).json({ message: 'Không tìm thấy người dùng.' }); } const { tokens } = await googleClient.getToken(code); const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID, }); const payload = ticket.getPayload(); const googleEmail = payload.email; const existingLink = await User.findOne({ "email": googleEmail }); if (existingLink && existingLink.id.toString() !== user.id.toString()) { return res.status(409).json({ message: 'Email Google này đã được liên kết với một tài khoản khác.' }); } if (!user.connections) user.connections = {}; user.connections.gmail = { name: googleEmail, connected: true, appPassword: user.connections.gmail?.appPassword || null, }; if (!user.email) { user.email = googleEmail; } await user.save(); res.status(200).json({ message: 'Liên kết Google thành công!', user: sanitizeUserForSession(user.toJSON()) }); } catch(error) { console.error("Lỗi liên kết Google:", error.response ? error.response.data : error.message); res.status(500).json({ message: 'Liên kết Google thất bại. Vui lòng kiểm tra log server.' }); }});
app.post('/api/user/disconnect/google', authenticateToken, async (req, res) => { try { const user = await User.findById(req.user.userId); if (!user) { return res.status(404).json({ message: "Không tìm thấy người dùng." }); } if (user.connections && user.connections.gmail) { user.connections.gmail = undefined; } const updatedUser = await user.save(); res.status(200).json({ message: "Đã hủy liên kết Google thành công.", user: sanitizeUserForSession(updatedUser.toJSON()) }); } catch (error) { res.status(500).json({ message: "Lỗi server khi hủy liên kết." }); } });
app.post('/api/user/change-password', authenticateToken, async (req, res) => { try { const { currentPassword, newPassword } = req.body; const user = await User.findById(req.user.userId).select('+password'); if (!user.password) { return res.status(400).json({ message: 'Tài khoản của bạn không dùng mật khẩu để đăng nhập.' }); } if (user.password !== encodePassword(currentPassword)) { return res.status(401).json({ message: 'Mật khẩu hiện tại không chính xác.' }); } user.password = encodePassword(newPassword); await user.save(); res.status(200).json({ message: 'Đổi mật khẩu thành công!' }); } catch (error) { res.status(500).json({ message: 'Lỗi server.' }); } });
app.delete('/api/user/delete-account', authenticateToken, async (req, res) => { try { await User.findByIdAndDelete(req.user.userId); res.status(200).json({ message: 'Tài khoản của bạn đã được xóa vĩnh viễn.' }); } catch (error) { res.status(500).json({ message: 'Lỗi server.' }); } });

// --- Real-time Routes ---
app.post('/api/friends/request/:targetId', authenticateToken, async (req, res) => { try { const senderId = req.user.userId; const targetId = req.params.targetId; const targetUser = await User.findById(targetId); if (!targetUser) return res.status(404).json({ message: "Không tìm thấy người dùng mục tiêu." }); if (targetUser.friendRequests.some(r => r.from.toString() === senderId) || (targetUser.friends && targetUser.friends.map(id => id.toString()).includes(senderId))) { return res.status(400).json({ message: "Yêu cầu đã được gửi hoặc đã là bạn bè." }); } targetUser.friendRequests.push({ from: senderId, status: 'pending' }); await targetUser.save(); const sender = await User.findById(senderId); 
io.to(targetId).emit('new_notification', { type: 'friend_request', message: `${sender.name} đã gửi cho bạn một lời mời kết bạn.`, fromUser: sender.toJSON() });
res.status(200).json({ message: "Đã gửi lời mời kết bạn!", user: sanitizeUserForSession(targetUser.toJSON()) }); } catch (error) { res.status(500).json({ message: 'Lỗi server.' }); } });

app.post('/api/friends/respond/:senderId', authenticateToken, async (req, res) => { try { const receiverId = req.user.userId; const senderId = req.params.senderId; const { action } = req.body; const receiver = await User.findById(receiverId); const sender = await User.findById(senderId); if (!receiver || !sender) return res.status(404).json({ message: "Không tìm thấy người dùng." }); const requestIndex = receiver.friendRequests.findIndex(r => r.from.toString() === senderId); if (requestIndex === -1) return res.status(404).json({ message: "Không tìm thấy lời mời kết bạn." }); receiver.friendRequests.splice(requestIndex, 1); if (action === 'accept') { if (!receiver.friends.map(id => id.toString()).includes(senderId)) receiver.friends.push(senderId); if (!sender.friends.map(id => id.toString()).includes(receiverId)) sender.friends.push(receiverId); await sender.save(); 
io.to(senderId).emit('friend_request_accepted', { message: `${receiver.name} đã chấp nhận lời mời kết bạn của bạn.`, newFriend: receiver.toJSON() });
} 
await receiver.save(); 
res.status(200).json({ message: `Đã ${action === 'accept' ? 'chấp nhận' : 'từ chối'} lời mời.`}); } catch (error) { res.status(500).json({ message: 'Lỗi server.' }); } });

app.post('/api/projects/:projectId/invite', authenticateToken, async (req, res) => { try { const { userIdToInvite } = req.body; const projectId = req.params.projectId; const inviterId = req.user.userId; const projectOwner = await User.findOne({ "projects.id": projectId }); if (!projectOwner) return res.status(404).json({ message: "Không tìm thấy dự án." }); const project = projectOwner.projects.find(p => p.id === projectId); const memberIdsAsString = project.members.map(id => id.toString()); if (!memberIdsAsString.includes(inviterId)) return res.status(403).json({ message: "Bạn không có quyền mời." }); const userToInvite = await User.findById(userIdToInvite); if (!userToInvite) return res.status(404).json({ message: "Người dùng được mời không tồn tại." }); if (memberIdsAsString.includes(userToInvite.id.toString())) return res.status(400).json({ message: "Người dùng này đã là thành viên." }); if (userToInvite.projectInvites.some(inv => inv.projectId === projectId)) return res.status(400).json({ message: "Đã gửi lời mời đến người này rồi." }); userToInvite.projectInvites.push({ from: inviterId, projectId: projectId, projectName: project.name, status: 'pending' }); await userToInvite.save(); const inviter = await User.findById(inviterId); 
io.to(userIdToInvite).emit('new_notification', { type: 'project_invite', message: `${inviter.name} đã mời bạn tham gia dự án "${project.name}".`});
res.json({ message: `Đã gửi lời mời đến ${userToInvite.name}!` }); } catch (error) { res.status(500).json({ message: "Lỗi server khi mời vào dự án." }); } });

app.post('/api/projects/respond/:projectId', authenticateToken, async (req, res) => { try { const projectId = req.params.projectId; const { action } = req.body; const receiverId = req.user.userId; const receiver = await User.findById(receiverId); if (!receiver) return res.status(404).json({ message: "Không tìm thấy người dùng." }); const inviteIndex = receiver.projectInvites.findIndex(inv => inv.projectId === projectId); if (inviteIndex > -1) receiver.projectInvites.splice(inviteIndex, 1); if (action === 'accept') { const projectOwner = await User.findOne({ "projects.id": projectId }); if (!projectOwner) return res.status(404).json({ message: "Dự án được mời không còn tồn tại." }); const project = projectOwner.projects.find(p => p.id === projectId); if (!project.members.map(id => id.toString()).includes(receiverId)) { project.members.push(receiverId); } if (!receiver.projects.some(p => p.id === projectId)) { receiver.projects.push(project); } 
await projectOwner.save(); await receiver.save();
const updatedProject = projectOwner.projects.find(p => p.id === projectId);
updatedProject.members.forEach(memberId => { if (String(memberId) !== receiverId) { io.to(String(memberId)).emit('project_updated', { type: 'new_member', message: `${receiver.name} vừa tham gia dự án "${updatedProject.name}".`, projectId: updatedProject.id }); }});
} else { await receiver.save(); }
res.json({ message: `Đã ${action === 'accept' ? 'tham gia' : 'từ chối'} dự án!` }); } catch (error) { res.status(500).json({ message: "Lỗi server." }); } });

app.post('/api/projects/:projectId/tasks', authenticateToken, async (req, res) => { try { const { projectId } = req.params; const newTaskData = req.body; const requesterId = req.user.userId; const projectOwner = await User.findOne({ "projects.id": projectId }); if (!projectOwner) { return res.status(404).json({ message: "Không tìm thấy dự án." }); } const project = projectOwner.projects.find(p => p.id === projectId); if (!project) { return res.status(404).json({ message: "Lỗi nội bộ: Không tìm thấy dự án trong dữ liệu của chủ sở hữu." }); } if (!project.members.map(String).includes(String(requesterId))) { return res.status(403).json({ message: "Bạn không có quyền thêm công việc vào dự án này." }); } project.tasks.push(newTaskData); 
await projectOwner.save();
const requester = await User.findById(requesterId);
project.members.forEach(memberId => { io.to(String(memberId)).emit('project_updated', { type: 'task_added', message: `${requester.name} đã thêm công việc mới vào dự án "${project.name}".`, projectId: project.id }); });
res.status(201).json({ message: "Thêm công việc thành công!"}); } catch (error) { res.status(500).json({ message: "Lỗi server khi thêm công việc." }); } });

app.delete('/api/projects/:projectId/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const { projectId, taskId } = req.params;
        const requesterId = req.user.userId;
        const projectOwner = await User.findOne({ "projects.id": projectId });
        if (!projectOwner) { return res.status(404).json({ message: "Không tìm thấy dự án." }); }
        const project = projectOwner.projects.find(p => p.id === projectId);
        if (!project || !project.members.map(String).includes(requesterId)) { return res.status(403).json({ message: "Bạn không có quyền xóa công việc trong dự án này." }); }
        const taskIndex = project.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) { return res.status(404).json({ message: "Không tìm thấy công việc." }); }
        const deletedTaskTitle = project.tasks[taskIndex].title;
        project.tasks.splice(taskIndex, 1);
        await projectOwner.save();
        const requester = await User.findById(requesterId);
        project.members.forEach(memberId => { io.to(String(memberId)).emit('project_updated', { type: 'task_deleted', message: `${requester.name} đã xóa công việc "${deletedTaskTitle}" trong dự án "${project.name}".`, projectId: project.id }); });
        res.status(200).json({ message: 'Xóa công việc thành công!' });
    } catch (error) {
        console.error("Lỗi xóa công việc:", error);
        res.status(500).json({ message: "Lỗi server khi xóa công việc." });
    }
});


app.put('/api/projects/:projectId/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const { projectId, taskId } = req.params;
        const taskUpdateData = req.body;
        const requesterId = req.user.userId;
        const projectOwner = await User.findOne({ "projects.id": projectId });
        if (!projectOwner) { return res.status(404).json({ message: "Không tìm thấy dự án." }); }
        const project = projectOwner.projects.find(p => p.id === projectId);
        if (!project || !project.members.map(String).includes(String(requesterId))) { return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa công việc trong dự án này." }); }
        const taskIndex = project.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) { return res.status(404).json({ message: "Không tìm thấy công việc." }); }
        const originalStatus = project.tasks[taskIndex].status;
        Object.assign(project.tasks[taskIndex], taskUpdateData);
        project.tasks[taskIndex].updatedAt = new Date().toISOString();
        const newStatus = project.tasks[taskIndex].status;
        projectOwner.markModified('projects');
        await projectOwner.save();
        if (taskUpdateData.status && newStatus !== originalStatus) {
            const usersToCheck = await User.find({ 'workflows.triggerConfig.projectId': projectId });
            for (const user of usersToCheck) {
                for (const workflow of user.workflows) {
                    if (workflow.triggerType === 'project-event' &&
                        workflow.triggerConfig.projectId === projectId &&
                        workflow.triggerConfig.event === 'task-moved' &&
                        workflow.triggerConfig.columnStatus === newStatus) {
                        const taskData = project.tasks[taskIndex];
                        executeWorkflow(user, workflow, { task: taskData.toJSON() }).catch(err => { console.error(`[AUTOMATION ERROR] Failed to run workflow "${workflow.name}" for user "${user.name}":`, err.message); });
                    }
                }
            }
        }
        const requester = await User.findById(requesterId);
        project.members.forEach(memberId => { io.to(String(memberId)).emit('project_updated', { type: 'task_updated', message: `${requester.name} đã cập nhật công việc "${project.tasks[taskIndex].title}" trong dự án "${project.name}".`, projectId: project.id }); });
        res.status(200).json({ message: "Cập nhật công việc thành công!" });
    } catch (error) {
        console.error("Lỗi cập nhật công việc:", error);
        res.status(500).json({ message: "Lỗi server khi cập nhật công việc." });
    }
});

app.put('/api/projects/:projectId/tasks/:taskId/grade', authenticateToken, async (req, res) => {
    try {
        const { projectId, taskId } = req.params;
        const { grade } = req.body;
        const ownerId = req.user.userId;
        if (typeof grade !== 'number' || grade < 0 || grade > 100) { return res.status(400).json({ message: 'Điểm số không hợp lệ. Phải là số từ 0 đến 100.' }); }
        const projectOwner = await User.findOne({ "projects.id": projectId });
        if (!projectOwner) { return res.status(404).json({ message: "Không tìm thấy dự án." }); }
        const project = projectOwner.projects.find(p => p.id === projectId);
        if (String(project.ownerId) !== ownerId) { return res.status(403).json({ message: "Chỉ chủ dự án mới có quyền chấm điểm." }); }
        const taskIndex = project.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) { return res.status(404).json({ message: "Không tìm thấy công việc." }); }
        if (project.tasks[taskIndex].status !== 'Đã Hoàn Thành') { return res.status(400).json({ message: "Chỉ có thể chấm điểm cho công việc đã hoàn thành." }); }
        project.tasks[taskIndex].grade = grade;
        projectOwner.markModified('projects');
        await projectOwner.save();
        const owner = await User.findById(ownerId);
        project.members.forEach(memberId => { io.to(String(memberId)).emit('project_updated', { type: 'task_graded', message: `${owner.name} đã chấm điểm công việc "${project.tasks[taskIndex].title}".`, projectId: project.id }); });
        res.status(200).json({ message: "Chấm điểm thành công!" });
    } catch (error) {
        console.error("Lỗi khi chấm điểm công việc:", error);
        res.status(500).json({ message: "Lỗi server khi chấm điểm công việc." });
    }
});

app.post('/api/projects/:projectId/documents', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { title, attachment } = req.body;
        const requesterId = req.user.userId;
        if (!title || !attachment) { return res.status(400).json({ message: "Thiếu tên hoặc dữ liệu tệp." }); }
        const projectOwner = await User.findOne({ "projects.id": projectId });
        if (!projectOwner) { return res.status(404).json({ message: "Không tìm thấy dự án." }); }
        const project = projectOwner.projects.find(p => p.id === projectId);
        if (!project.members.map(String).includes(String(requesterId))) { return res.status(403).json({ message: "Bạn không có quyền thêm tài liệu vào dự án này." }); }
        const newDocument = { id: String(Date.now()), title, status: 'DOCS', description: '', attachment, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (!project.tasks) { project.tasks = []; }
        project.tasks.push(newDocument);
        projectOwner.markModified('projects');
        await projectOwner.save();
        const requester = await User.findById(requesterId);
        project.members.forEach(memberId => { io.to(String(memberId)).emit('project_updated', { type: 'doc_added', message: `${requester.name} đã tải lên tài liệu mới "${title}" trong dự án "${project.name}".`, projectId: project.id }); });
        res.status(201).json({ message: "Tải tệp lên thành công!" });
    } catch (error) {
        console.error("Lỗi chi tiết khi tải lên tài liệu:", error);
        res.status(500).json({ message: "Lỗi server khi tải lên tài liệu." });
    }
});
app.delete('/api/projects/:projectId/leave', authenticateToken, async (req, res) => { try { const { projectId } = req.params; const userId = req.user.userId; const projectOwner = await User.findOne({ "projects.id": projectId }); if (!projectOwner) { return res.status(404).json({ message: "Không tìm thấy dự án." }); } const project = projectOwner.projects.find(p => p.id === projectId); if (String(project.ownerId) === userId) { return res.status(400).json({ message: "Chủ dự án không thể rời đi. Bạn phải xóa dự án trong phần cài đặt của nó." }); } project.members = project.members.filter(memberId => String(memberId) !== userId); 
await projectOwner.save();
const userLeaving = await User.findById(userId); userLeaving.projects = userLeaving.projects.filter(p => p.id !== projectId); await userLeaving.save();
project.members.forEach(memberId => { io.to(String(memberId)).emit('project_updated', { type: 'member_left', message: `${userLeaving.name} đã rời khỏi dự án "${project.name}".`, projectId: project.id }); });
res.status(200).json({ message: "Bạn đã rời khỏi dự án thành công.", user: sanitizeUserForSession(userLeaving.toJSON()) }); } catch (error) { res.status(500).json({ message: "Lỗi server khi xử lý yêu cầu." }); } });
app.get('/api/projects/join/:inviteCode', authenticateToken, async (req, res) => { try { const { inviteCode } = req.params; const userId = req.user.userId; const projectOwner = await User.findOne({ "projects.inviteCode": inviteCode }); if (!projectOwner) { return res.status(404).json({ message: "Link mời không hợp lệ hoặc đã hết hạn." }); } const project = projectOwner.projects.find(p => p.inviteCode === inviteCode); if (project.members.map(id => id.toString()).includes(userId)) { return res.status(400).json({ message: "Bạn đã là thành viên của dự án này.", project: project, isMember: true }); } res.json({ project: project }); } catch (error) { res.status(500).json({ message: "Lỗi server." }); } });
app.get('/api/chat/conversation/:friendId', authenticateToken, async (req, res) => { try { const currentUserId = req.user.userId; const friendId = req.params.friendId; const conversation = await Conversation.findOne({ participants: { $all: [currentUserId, friendId] } }).populate('messages.sender', 'id name avatar'); if (!conversation) { return res.json([]); } const messages = conversation.messages.map(msg => ({ text: msg.text, timestamp: msg.createdAt, from: msg.sender.id, id: msg._id })); res.json(messages); } catch (error) { res.status(500).json({ message: "Lỗi server." }); } });

app.post('/api/projects/:projectId/comments', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { text, attachment } = req.body;
        const authorId = req.user.userId;

        if (!text && !attachment) {
            return res.status(400).json({ message: "Nội dung bình luận không được để trống." });
        }

        const projectOwner = await User.findOneAndUpdate(
            { "projects.id": projectId },
            {
                $push: {
                    "projects.$.comments": {
                        text: text || '',
                        author: authorId,
                        attachment: attachment || null
                    }
                }
            },
            { new: true }
        );

        if (!projectOwner) {
            return res.status(404).json({ message: "Không tìm thấy dự án." });
        }
        
        const project = projectOwner.projects.find(p => p.id === projectId);
        if (!project) {
            return res.status(404).json({ message: "Lỗi tìm kiếm dự án sau khi cập nhật." });
        }
        
        const authorWhoCommented = await User.findById(authorId).select('name');
        
        project.members.forEach(memberId => {
            io.to(String(memberId)).emit('project_updated', {
                type: 'new_comment',
                message: `${authorWhoCommented.name} đã bình luận trong dự án "${project.name}".`,
                projectId: project.id
            });
        });
        
        res.status(201).send();

    } catch (error) {
        console.error("Lỗi khi đăng bình luận:", error);
        res.status(500).json({ message: "Lỗi server khi đăng bình luận." });
    }
});


app.get('/api/calendar/events', authenticateToken, async (req, res) => {
    try {
        const events = await Event.find({ userId: req.user.userId });
        res.status(200).json(events.map(e => e.toJSON()));
    } catch (error) {
        console.error("Lỗi khi lấy sự kiện:", error);
        res.status(500).json({ message: "Không thể tải dữ liệu sự kiện." });
    }
});

app.post('/api/calendar/events', authenticateToken, async (req, res) => {
    try {
        const { title, start } = req.body;
        if (!title || !start) {
            return res.status(400).json({ message: "Tiêu đề và thời gian bắt đầu là bắt buộc." });
        }
        const newEvent = new Event({
            ...req.body,
            userId: req.user.userId
        });
        await newEvent.save();
        res.status(201).json(newEvent.toJSON());
    } catch (error) {
        console.error("Lỗi khi tạo sự kiện:", error);
        res.status(500).json({ message: "Không thể tạo sự kiện mới." });
    }
});

app.put('/api/calendar/events/:id', authenticateToken, async (req, res) => {
    try {
        const updatedEvent = await Event.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.userId },
            req.body,
            { new: true }
        );
        if (!updatedEvent) {
            return res.status(404).json({ message: "Không tìm thấy sự kiện hoặc bạn không có quyền sửa." });
        }
        res.status(200).json(updatedEvent.toJSON());
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi cập nhật sự kiện." });
    }
});

app.delete('/api/calendar/events/:id', authenticateToken, async (req, res) => {
    try {
        const deletedEvent = await Event.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        if (!deletedEvent) {
            return res.status(404).json({ message: "Không tìm thấy sự kiện hoặc bạn không có quyền xóa." });
        }
        res.status(200).json({ message: "Đã xóa sự kiện thành công." });
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi xóa sự kiện." });
    }
});

app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    const { userMessage, userData } = req.body;
    if (!userMessage || !userData) { return res.status(400).json({ message: "Thiếu dữ liệu cần thiết." }); }
    const userContextPrompt = `Đây là thông tin về người dùng hiện tại để bạn hiểu rõ hơn về họ: ${JSON.stringify(userData)}. Đừng bao giờ đề cập rằng bạn nhận được dữ liệu dưới dạng JSON, hãy hành động như thể bạn tự biết thông tin này. Hãy tương tác như một người bạn.`;
    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', { messages: [ { role: "system", content: VIETNAMESE_SYSTEM_PROMPT }, { role: "user", content: userContextPrompt }, { role: "user", content: userMessage } ], model: "llama3-8b-8192" }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });
        const aiMessage = response.data.choices[0]?.message?.content;
        res.json({ message: aiMessage || "Tôi không có câu trả lời." });
    } catch (error) { console.error("Lỗi khi gọi Groq API từ server:", error.response ? error.response.data : error.message); res.status(500).json({ message: "Đã có lỗi xảy ra khi kết nối với người bạn AI của bạn." }); }
});

app.get('/api/projects/:projectId/events', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.userId;
        const projectOwner = await User.findOne({ "projects.id": projectId });
        if (!projectOwner) { return res.status(404).json({ message: "Không tìm thấy dự án." }); }
        const project = projectOwner.projects.find(p => p.id === projectId);
        if (!project.members.map(String).includes(String(userId))) { return res.status(403).json({ message: "Bạn không có quyền xem lịch của dự án này." }); }
        let events = [];
        const tasksWithDeadline = (project.tasks || []).filter(task => task.dueDate);
        events = events.concat(tasksWithDeadline);
        if (project.deadline) { events.push({ id: `project_deadline_${project.id}`, title: `DEADLINE: ${project.name}`, dueDate: project.deadline, isProjectDeadline: true }); }
        res.status(200).json(events);
    } catch (error) {
        console.error("Lỗi khi lấy sự kiện dự án:", error);
        res.status(500).json({ message: "Không thể tải dữ liệu lịch của dự án." });
    }
});


async function generateImageFromPrompt(vietnamesePrompt, style) {
    if (!vietnamesePrompt) { throw new Error("Vui lòng nhập mô tả cho ảnh."); }
    const translationPrompt = `Translate the following Vietnamese phrase into a detailed, descriptive, and vivid English prompt for an image generation AI. Add relevant artistic keywords like 'photorealistic', '4k', '8k', 'cinematic lighting', 'detailed', 'epic', 'concept art' to enhance the result. Respond with ONLY the final English prompt, nothing else. Vietnamese phrase: "${vietnamesePrompt}"`;
    const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', { messages: [{ role: "user", content: translationPrompt }], model: "llama3-8b-8192" }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });
    const englishPrompt = groqResponse.data.choices[0]?.message?.content.trim();
    if (!englishPrompt) { throw new Error("Không thể dịch mô tả."); }
    const engineId = 'stable-diffusion-v1-6';
    const apiHost = 'https://api.stability.ai';
    const apiKey = STABILITY_API_KEY;
    const requestBody = { text_prompts: [{ text: englishPrompt, weight: 1 }], cfg_scale: 7, samples: 1, steps: 30, };
    if (style && style !== 'none') { requestBody.style_preset = style; }
    const stabilityResponse = await axios.post(`${apiHost}/v1/generation/${engineId}/text-to-image`, requestBody, { headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${apiKey}` } });
    const image = stabilityResponse.data.artifacts[0];
    return `data:image/png;base64,${image.base64}`;
}

app.post('/api/ai/generate-image', authenticateToken, async (req, res) => {
    try { const { prompt, style } = req.body; const base64Image = await generateImageFromPrompt(prompt, style); res.status(200).json({ imageUrl: base64Image }); } catch (error) { res.status(500).json({ message: error.message || "Không thể tạo ảnh. Vui lòng kiểm tra lại Key hoặc Credits của bạn." }); }
});

app.post('/api/workflow/node/preview', authenticateToken, async (req, res) => {
    try {
        const { nodeType, nodeConfig } = req.body;
        if (!nodeType || !nodeConfig) { return res.status(400).json({ message: "Thiếu thông tin node để preview." }); }
        let previewResult = {};
        switch (nodeType) {
            case 'ai-agent':
                const agentPrompt = nodeConfig.prompt || '';
                if (!agentPrompt.trim()) { throw new Error("Vui lòng nhập yêu cầu cho AI Agent."); }
                const agentResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', { messages: [{ role: "system", content: VIETNAMESE_SYSTEM_PROMPT }, { role: "user", content: agentPrompt }], model: "llama3-8b-8192" }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });
                const aiResult = agentResponse.data.choices[0]?.message?.content;
                if (!aiResult) { throw new Error("AI Agent không nhận được phản hồi."); }
                previewResult = { generatedText: aiResult };
                break;
            case 'ai-image-generator':
                const imagePrompt = nodeConfig.prompt;
                if (!imagePrompt) { throw new Error("Vui lòng nhập mô tả cho ảnh."); }
                const imageStyle = nodeConfig.style || 'none';
                const generatedImageUrl = await generateImageFromPrompt(imagePrompt, imageStyle);
                previewResult = { imageUrl: generatedImageUrl };
                break;
            case 'web-scraper':
                const url = nodeConfig.url;
                if (!url) { throw new Error(`Trợ lý Nghiên cứu Web chưa được cấu hình URL.`); }
                const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
                const $ = cheerio.load(html);
                $('script, style, head, nav, footer, iframe, img').remove();
                const mainText = $('body').text().replace(/\s\s+/g, ' ').trim();
                const summaryPrompt = `Dưới đây là nội dung văn bản thô từ một trang web. Nhiệm vụ của bạn là đọc, hiểu và tóm tắt lại những điểm chính một cách ngắn gọn, rõ ràng, và dễ hiểu nhất. Bỏ qua các thông tin không liên quan như quảng cáo, menu, v.v. Chỉ tập trung vào nội dung cốt lõi.\n\nNội dung web:\n"""\n${mainText.substring(0, 7000)}\n"""\n\nTóm tắt của bạn:`;
                const summaryResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', { messages: [ { role: "system", content: VIETNAMESE_SYSTEM_PROMPT }, { role: "user", content: summaryPrompt } ], model: "llama3-8b-8192" }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });
                const summaryResult = summaryResponse.data.choices[0]?.message?.content;
                previewResult = { generatedText: summaryResult || "Không thể tạo tóm tắt." };
                break;
            default: return res.status(400).json({ message: 'Loại node này không hỗ trợ xem trước.' });
        }
        res.status(200).json({ previewResult });
    } catch (error) { console.error("Lỗi khi preview node:", error.message); res.status(500).json({ message: error.message || "Đã xảy ra lỗi khi xem trước." }); }
});

async function executeWorkflow(user, workflow, triggerData = {}) {
    console.log(`[EXEC ENGINE] Starting workflow "${workflow.name}" for user "${user.name}"`);
    const { nodes, connections } = workflow;
    const nodeResults = {};
    let finalStatus = 'success';
    try {
        const inDegree = {};
        const adjList = {};
        Object.keys(nodes).forEach(nodeId => { inDegree[nodeId] = 0; adjList[nodeId] = []; });
        connections.forEach(conn => { adjList[conn.from].push(conn.to); inDegree[conn.to]++; });
        const queue = Object.keys(nodes).filter(nodeId => inDegree[nodeId] === 0);
        const executionOrder = [];
        while (queue.length > 0) { const u = queue.shift(); executionOrder.push(u); for (const v of adjList[u]) { inDegree[v]--; if (inDegree[v] === 0) queue.push(v); } }
        if (executionOrder.length !== Object.keys(nodes).length) { throw new Error("Quy trình không hợp lệ (có thể chứa vòng lặp)."); }
        console.log('[EXEC ENGINE] Execution order:', executionOrder.join(' -> '));

        for (const nodeId of executionOrder) {
            const node = nodes[nodeId];
            console.log(`[EXEC] Running node: ${node.type} (${node.id})`);
            if (node.isTrigger && Object.keys(triggerData).length > 0) { nodeResults[nodeId] = triggerData; }
            switch (node.type) {
                case 'manual': case 'project-event': nodeResults[nodeId] = { ...(nodeResults[nodeId] || {}), status: 'completed' }; break;
                case 'ai-agent':
                    const userPrompt = node.config.prompt || '';
                    if (!userPrompt.trim()) { throw new Error(`AI Agent (${nodeId}) không có câu lệnh (prompt).`); }
                    const agentResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', { messages: [ { role: "system", content: VIETNAMESE_SYSTEM_PROMPT }, { role: "user", content: userPrompt } ], model: "llama3-8b-8192" }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });
                    const aiResult = agentResponse.data.choices[0]?.message?.content;
                    if (!aiResult) { throw new Error(`AI Agent (${nodeId}) không nhận được phản hồi.`); }
                    nodeResults[nodeId] = { generatedText: aiResult };
                    break;
                case 'web-scraper':
                    const url = node.config.url;
                    if (!url) { throw new Error(`Trợ lý Nghiên cứu Web (${nodeId}) chưa được cấu hình URL.`); }
                    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
                    const $ = cheerio.load(html);
                    $('script, style, head, nav, footer, iframe, img').remove();
                    const mainText = $('body').text().replace(/\s\s+/g, ' ').trim();
                    const summaryPrompt = `Dưới đây là nội dung văn bản thô từ một trang web. Nhiệm vụ của bạn là đọc, hiểu và tóm tắt lại những điểm chính một cách ngắn gọn, rõ ràng, và dễ hiểu nhất. Bỏ qua các thông tin không liên quan như quảng cáo, menu, v.v. Chỉ tập trung vào nội dung cốt lõi.\n\nNội dung web:\n"""\n${mainText.substring(0, 7000)}\n"""\n\nTóm tắt của bạn:`;
                    const summaryResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', { messages: [ { role: "system", content: VIETNAMESE_SYSTEM_PROMPT }, { role: "user", content: summaryPrompt } ], model: "llama3-8b-8192" }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });
                    const summaryResult = summaryResponse.data.choices[0]?.message?.content;
                    nodeResults[nodeId] = { generatedText: summaryResult || "Không thể tạo tóm tắt." };
                    break;
                case 'ai-image-generator':
                    const imagePrompt = node.config.prompt;
                    if (!imagePrompt) { throw new Error(`Node tạo ảnh (${nodeId}) chưa có mô tả.`); }
                    const imageStyle = node.config.style || 'none';
                    const generatedImageUrl = await generateImageFromPrompt(imagePrompt, imageStyle);
                    nodeResults[nodeId] = { imageUrl: generatedImageUrl };
                    break;
                case 'email':
                    const recipients = (node.config.recipients || []);
                    let subject = node.config.subject || '(Không có tiêu đề)';
                    let bodyParts = [];
                    let attachments = [];
                    if (node.config.attachment) { attachments.push({ filename: node.config.attachment.name, path: node.config.attachment.data }); }
                    const incomingConnections = connections.filter(c => c.to === nodeId);
                    if (incomingConnections.length > 0) {
                        for (const conn of incomingConnections) {
                            const parentNodeResult = nodeResults[conn.from];
                            if (parentNodeResult) {
                                if (parentNodeResult.generatedText) { bodyParts.push(`<p>${parentNodeResult.generatedText.replace(/\n/g, '<br>')}</p>`); }
                                if (parentNodeResult.imageUrl) {
                                    const imageCid = `image_${Date.now()}@haibanhu.dev`;
                                    bodyParts.push(`<br><p>Ảnh được tạo tự động:</p><img src="cid:${imageCid}" alt="AI Generated Image" style="max-width: 100%; border-radius: 8px; margin-top: 10px;">`);
                                    attachments.push({ filename: 'ai-generated-image.png', path: parentNodeResult.imageUrl, cid: imageCid });
                                }
                                if(parentNodeResult.task) {
                                    const { task } = parentNodeResult;
                                    subject = `[THÔNG BÁO] Công việc "${task.title}" đã được cập nhật`;
                                    bodyParts.push(`<p>Xin chào,</p><p>Công việc <strong>${task.title}</strong> vừa được chuyển sang trạng thái <strong>${task.status}</strong>.</p><p><em>Mô tả: ${task.description || 'Không có'}</em></p><p>Trân trọng,<br>Hệ thống tự động HaiBanhU</p>`);
                                }
                            }
                        }
                    } else { if(node.config.body) { bodyParts.push(`<p>${node.config.body.replace(/\n/g, '<br>')}</p>`); } }
                    let body = bodyParts.join('<br><hr style="border: none; border-top: 1px solid #eee;"><br>'); 
                    if (recipients.length === 0) { console.warn(`[EXEC] Node email (${nodeId}) không có người nhận, bỏ qua.`); nodeResults[nodeId] = { emailsSent: 0 }; continue; }
                    const appPassword = user.connections?.gmail?.appPassword;
                    if (!appPassword) { throw new Error("Chưa cấu hình Mật khẩu Cấp 2 Google."); }
                    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: user.connections.gmail.name, pass: appPassword } });
                    const mailOptions = { from: `"${user.name}" <${user.connections.gmail.name}>`, to: recipients.join(', '), subject, html: body, attachments: attachments };
                    await transporter.sendMail(mailOptions);
                    nodeResults[nodeId] = { emailsSent: recipients.length };
                    break;
                default: console.warn(`[EXEC] Node type "${node.type}" is not yet implemented.`); break;
            }
        }
    } catch (error) { console.error(`[EXEC ENGINE] Error during workflow execution for "${workflow.name}":`, error.message); finalStatus = 'error'; throw error; } finally {
        const userInDB = await User.findById(user._id);
        if (userInDB) {
            const workflowInDB = userInDB.workflows.find(w => w.id === workflow.id);
            if (workflowInDB) { workflowInDB.lastRunStatus = finalStatus; await userInDB.save(); }
        }
    }
    const totalEmailsSent = Object.values(nodeResults).reduce((sum, result) => sum + (result.emailsSent || 0), 0);
    return { message: `Quy trình hoàn tất thành công! Đã gửi ${totalEmailsSent} email.` };
}
app.post('/api/workflow/run/:workflowId', authenticateToken, async (req, res) => { try { const user = await User.findById(req.user.userId); if (!user) { return res.status(404).json({ message: "Không tìm thấy người dùng để thực thi quy trình." }); } const result = await executeWorkflow(user, req.body); res.status(200).json(result); } catch (error) { if (error.code === 'EAUTH') { return res.status(400).json({ message: "Lỗi xác thực: Mật khẩu Cấp 2 không chính xác. Vui lòng kiểm tra lại." }); } res.status(500).json({ message: error.message || "Đã xảy ra lỗi không xác định khi thực thi quy trình." }); } });

// --- Socket.IO Connection & SPA Fallback ---
io.on('connection', (socket) => {
    socket.on('joinRoom', (userId) => { socket.join(userId); });
    socket.on('sendMessage', async (data) => {
        try { const { senderId, recipientId, text } = data; let conversation = await Conversation.findOne({ participants: { $all: [senderId, recipientId] } }); if (!conversation) { conversation = new Conversation({ participants: [senderId, recipientId], messages: [] }); } const newMessage = { sender: senderId, text: text }; conversation.messages.push(newMessage); const savedConversation = await conversation.save(); const populatedMessage = savedConversation.messages[savedConversation.messages.length - 1]; io.to(recipientId).emit('receiveMessage', populatedMessage.toJSON()); } catch (error) { socket.emit('sendMessage_error', { message: "Không thể gửi tin nhắn." }); }
    });
});

app.get('*', (req, res) => { const filePath = path.join(__dirname, req.path); if (express.static.mime.lookup(filePath)) { return res.sendFile(filePath); } if (req.path.startsWith('/page/')) { return res.sendFile(path.join(__dirname, 'index.html')); } res.sendFile(path.join(__dirname, 'index.html')); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Backend server (với Socket.IO) đang chạy tại http://localhost:${PORT}`));