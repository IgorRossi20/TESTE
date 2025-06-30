import { firebaseConfig, appId } from '../firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, onSnapshot, query, serverTimestamp, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- App Initialization ---
let app, auth, db, storage;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
} catch (e) {
    console.error("Firebase initialization failed:", e);
    document.getElementById('loading-spinner').innerHTML = '<p class="text-red-500">Erro ao conectar com a base de dados. Tente recarregar.</p>';
}

// --- DOM Elements ---
const loadingSpinner = document.getElementById('loading-spinner');
const mainContent = document.getElementById('main-content');
const nicknameModal = document.getElementById('nickname-modal');
const nicknameInput = document.getElementById('nickname-input');
const photoUrlInput = document.getElementById('photo-url-input');
const saveNicknameBtn = document.getElementById('save-nickname-btn');
const nicknameError = document.getElementById('nickname-error');
const addCatchBtn = document.getElementById('add-catch-btn');
const addCatchModal = document.getElementById('add-catch-modal');
const closeCatchModalBtn = document.getElementById('close-catch-modal');
const catchForm = document.getElementById('catch-form');
const catchError = document.getElementById('catch-error');
const fishPhotoInput = document.getElementById('fish-photo-input');
const fileNameDisplay = document.getElementById('file-name');
const submitCatchBtn = document.getElementById('submit-catch-btn');
const rankingList = document.getElementById('ranking-list');
const feedContainer = document.getElementById('feed-container');

let currentUser = { uid: null, nickname: null, photoURL: null };
let unsubscribeCatches = null;

// --- Main App Logic ---
async function startApp() {
    try {
        const userCredential = await signInAnonymously(auth);
        currentUser.uid = userCredential.user.uid;
        setupListeners();
    } catch (error) {
        console.error("Anonymous sign-in failed:", error);
        loadingSpinner.innerHTML = '<p class="text-red-500">Não foi possível iniciar. Tente recarregar a página.</p>';
    }
}

// --- Event Listeners ---
addCatchBtn.addEventListener('click', () => {
    if (!currentUser.nickname) {
        nicknameModal.style.display = 'flex';
    } else {
        addCatchModal.style.display = 'flex';
    }
});

saveNicknameBtn.addEventListener('click', () => {
    nicknameError.textContent = '';
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
        nicknameError.textContent = 'O nome de guerra é obrigatório!';
        return;
    }
    currentUser.nickname = nickname;
    currentUser.photoURL = photoUrlInput.value.trim() || `https://placehold.co/100x100/3B82F6/FFFFFF?text=${nickname.charAt(0).toUpperCase()}`;
    nicknameModal.style.display = 'none';
    addCatchModal.style.display = 'flex';
});

fishPhotoInput.addEventListener('change', () => {
    if (fishPhotoInput.files.length > 0) {
        fileNameDisplay.textContent = fishPhotoInput.files[0].name;
    } else {
        fileNameDisplay.textContent = '';
    }
});

closeCatchModalBtn.addEventListener('click', () => {
    addCatchModal.style.display = 'none';
    catchForm.reset();
    fileNameDisplay.textContent = '';
    catchError.textContent = '';
});

catchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    catchError.textContent = '';
    submitCatchBtn.disabled = true;
    submitCatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    const species = e.target.elements.species.value.trim();
    const weight = parseFloat(e.target.elements.weight.value);
    const photoFile = e.target.elements.photo.files[0];
    if (!species || !weight || !photoFile) {
        catchError.textContent = 'Todos os campos são obrigatórios!';
        submitCatchBtn.disabled = false;
        submitCatchBtn.innerHTML = 'Salvar Captura';
        return;
    }
    if (weight <= 0) {
        catchError.textContent = 'O peso deve ser maior que zero!';
        submitCatchBtn.disabled = false;
        submitCatchBtn.innerHTML = 'Salvar Captura';
        return;
    }
    try {
        // 1. Upload image to Firebase Storage
        const filePath = `catches/${currentUser.uid}/${Date.now()}-${photoFile.name}`;
        const storageRef = ref(storage, filePath);
        const snapshot = await uploadBytes(storageRef, photoFile);
        const photoURL = await getDownloadURL(snapshot.ref);
        // 2. Add catch data to Firestore
        await addDoc(collection(db, `artifacts/${appId}/public/data/catches`), {
            userId: currentUser.uid,
            userNickname: currentUser.nickname,
            userPhotoURL: currentUser.photoURL,
            species: species,
            weight: weight,
            photoURL: photoURL,
            timestamp: serverTimestamp(),
            likes: [],
            comments: []
        });
        addCatchModal.style.display = 'none';
        catchForm.reset();
        fileNameDisplay.textContent = '';
    } catch (error) {
         console.error("Error adding catch:", error);
         catchError.textContent = "Erro ao registrar a captura. Tente de novo.";
    } finally {
        submitCatchBtn.disabled = false;
        submitCatchBtn.innerHTML = 'Salvar Captura';
    }
});

// --- Real-time Data Listeners ---
function setupListeners() {
    const catchesQuery = query(collection(db, `artifacts/${appId}/public/data/catches`));
    unsubscribeCatches = onSnapshot(catchesQuery, (snapshot) => {
        loadingSpinner.style.display = 'none';
        mainContent.classList.remove('invisible');
        const allCatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allCatches.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        updateUI(allCatches);
    }, error => {
        console.error("Error listening to catches:", error)
        loadingSpinner.innerHTML = '<p class="text-red-500">Erro ao carregar os dados.</p>';
    });
}

// --- UI Update Logic ---
function updateUI(catches) {
    updateRanking(catches);
    updateFeed(catches);
}

function updateRanking(catches) {
    const statsMap = {};
    catches.forEach(c => {
        if (!statsMap[c.userId]) {
            statsMap[c.userId] = {
                uid: c.userId, nickname: c.userNickname, photoURL: c.userPhotoURL,
                totalWeight: 0, catchCount: 0,
            };
        }
        statsMap[c.userId].totalWeight += c.weight;
        statsMap[c.userId].catchCount++;
    });
    let rankedUsers = Object.values(statsMap).sort((a, b) => b.totalWeight - a.totalWeight);
    rankingList.innerHTML = '';
    if (rankedUsers.length === 0) {
        rankingList.innerHTML = `<p class="text-gray-500 text-center">Ninguém pescou nada ainda. Seja o primeiro!</p>`;
        return;
    }
    rankedUsers.forEach((user, index) => {
        const rank = index + 1;
        let rankIcon = `<span class="font-bold text-gray-500 w-8 text-center">${rank}.</span>`;
        let specialTitle = '';
        if (rank === 1 && user.totalWeight > 0) {
            rankIcon = `<i class="fas fa-crown crown-gold fa-lg w-8 text-center"></i>`;
            specialTitle = `<div class="text-xs font-bold text-yellow-500 mt-1">PESCADOR FODA</div>`;
        } else if (rank === 2 && user.totalWeight > 0) rankIcon = `<i class="fas fa-crown crown-silver fa-lg w-8 text-center"></i>`;
        else if (rank === 3 && user.totalWeight > 0) rankIcon = `<i class="fas fa-crown crown-bronze fa-lg w-8 text-center"></i>`;
        const fishersWithCatches = rankedUsers.filter(u => u.totalWeight > 0).length;
        if (rank === rankedUsers.length && fishersWithCatches > 1 && user.totalWeight < rankedUsers[0].totalWeight) {
             specialTitle = `<div class="text-xs font-bold text-red-700 mt-1 flex items-center justify-center gap-1"><i class="fas fa-poo text-amber-800"></i> PESCA FOFO</div>`;
        }
        const userElement = document.createElement('div');
        userElement.className = `p-3 rounded-lg flex items-center space-x-3 transition-all ${rank === 1 ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-gray-100'}`;
        userElement.innerHTML = `
            ${rankIcon}
            <img src="${user.photoURL}" alt="${user.nickname}" class="w-12 h-12 rounded-full object-cover border-2 border-gray-300">
            <div class="flex-grow">
                <p class="font-bold text-gray-800">${user.nickname}</p>
                <p class="text-sm text-gray-600">${user.totalWeight.toFixed(2)} kg (${user.catchCount} peixes)</p>
                ${specialTitle}
            </div>`;
        rankingList.appendChild(userElement);
    });
}

function updateFeed(catches) {
    feedContainer.innerHTML = '';
    if (catches.length === 0) {
        feedContainer.innerHTML = `<div class="bg-white rounded-xl shadow-lg p-8 text-center">
                <i class="fas fa-water fa-3x text-blue-300 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-700">O lago está calmo...</h3>
                <p class="text-gray-500">Nenhuma captura registrada ainda. Hora de molhar a linha!</p>
            </div>`;
        return;
    }
    catches.forEach(c => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-lg overflow-hidden';
        const timeAgo = c.timestamp ? formatTimeAgo(c.timestamp.toDate()) : 'agora mesmo';
        let commentsHTML = '';
        if (c.comments && c.comments.length > 0) {
            commentsHTML = c.comments.map(comment => `
                <div class="text-sm mt-2">
                    <span class="font-bold">${comment.nickname || 'Anônimo'}:</span>
                    <span>${comment.text}</span>
                </div>
            `).join('');
        }
        card.innerHTML = `
            <div class="p-4 flex items-center space-x-3 border-b border-gray-200">
                <img src="${c.userPhotoURL}" alt="${c.userNickname}" class="w-12 h-12 rounded-full object-cover">
                <div>
                    <p class="font-bold text-gray-800">${c.userNickname}</p>
                    <p class="text-sm text-gray-500">${timeAgo}</p>
                </div>
            </div>
            <img src="${c.photoURL}" alt="Peixe pescado: ${c.species}" class="w-full h-auto object-cover max-h-[600px]" onerror="this.onerror=null;this.src='https://placehold.co/600x400/CCCCCC/FFFFFF?text=Imagem+Inválida';">
            <div class="p-4">
                <p class="text-lg font-semibold"><span class="font-bold">${c.species}</span> de <span class="font-bold">${c.weight.toFixed(2)} kg</span></p>
                <div class="flex items-center mt-3 text-gray-600">
                    <button data-catch-id="${c.id}" class="like-btn text-xl hover:text-red-500 transition-colors ${c.likes.includes(currentUser.uid) ? 'text-red-500' : ''}">
                        <i class="fas fa-heart"></i>
                    </button>
                    <span class="ml-2 text-lg">${c.likes.length}</span>
                </div>
                <div class="mt-4">
                    <div class="comments-section max-h-40 overflow-y-auto comment-scrollbar pr-2">${commentsHTML}</div>
                    <form class="comment-form mt-3 flex gap-2" data-catch-id="${c.id}">
                        <input type="text" class="w-full border-2 border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-400" placeholder="Adicione um comentário..." required>
                        <button type="submit" class="bg-blue-500 text-white font-bold px-4 py-2 rounded-lg hover:bg-blue-600"><i class="fas fa-paper-plane"></i></button>
                    </form>
                </div>
            </div>`;
        feedContainer.appendChild(card);
    });
    document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', handleLikeClick));
    document.querySelectorAll('.comment-form').forEach(form => form.addEventListener('submit', handleCommentSubmit));
}

async function handleLikeClick(e) {
    if(!currentUser.nickname) { alert("Você precisa de um nome de guerra para curtir!"); return; }
    const button = e.currentTarget;
    const catchId = button.dataset.catchId;
    const catchDocRef = doc(db, `artifacts/${appId}/public/data/catches`, catchId);
    const catchDoc = await getDoc(catchDocRef);
    if (catchDoc.exists()) {
        const catchData = catchDoc.data();
        const likes = catchData.likes || [];
        const newLikes = likes.includes(currentUser.uid)
            ? likes.filter(uid => uid !== currentUser.uid)
            : [...likes, currentUser.uid];
        await updateDoc(catchDocRef, { likes: newLikes });
    }
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    if (!currentUser.nickname) {
        nicknameModal.style.display = 'flex';
        return;
    }
    const form = e.currentTarget;
    const input = form.querySelector('input');
    const catchId = form.dataset.catchId;
    const commentText = input.value.trim();
    if (!commentText) return;
    const comment = {
        userId: currentUser.uid,
        nickname: currentUser.nickname,
        text: commentText,
        timestamp: serverTimestamp()
    };
    const catchDocRef = doc(db, `artifacts/${appId}/public/data/catches`, catchId);
    try {
        await updateDoc(catchDocRef, {
            comments: arrayUnion(comment)
        });
        form.reset();
    } catch (error) {
        console.error("Error adding comment: ", error);
        alert("Não foi possível adicionar o comentário.");
    }
}

// --- Utility Functions ---
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " anos atrás";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses atrás";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " dias atrás";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " horas atrás";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutos atrás";
    return "agora mesmo";
}

// --- Start the app ---
window.onload = startApp; 