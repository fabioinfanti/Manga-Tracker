
// Supabase configuration
const supabaseUrl = 'https://bjvxoipmvzyiarurthhj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqdnhvaXBtdnp5aWFydXJ0aGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1ODAzMTgsImV4cCI6MjA3MDE1NjMxOH0.-76MObuwwveLnITqzusR_r1S2vM9BMEnYfdZiwzf9UU';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true
    }
});

// Google API config
const GOOGLE_API_KEY = 'AIzaSyADAtYJz0IT0bnLZkiTSS0ND7MbwRbzqKo';
const GOOGLE_CX = '1047ca13cc6044e1b';

// UI elements
const logoutBtn = document.getElementById('logout-btn');
const sortSelect = document.getElementById('sort-select');
const mangaList = document.getElementById('manga-list');

let user = null;
let mangas = [];
let currentManga = null;
let selectedCoverUrl = null;
let mangaToEdit = null;

// ---------- SESSION & AUTH HANDLING ----------

async function handleCredentialResponse(response) {
    const jwt = response.credential;

    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: jwt,
    });

    if (error) {
        console.error('Supabase sign-in error:', error.message);
        showNotification('Falha no login. Por favor, tente novamente.');
        return;
    }

    user = data.user;
    updateUIOnLogin();
    await loadFromSupabase();
}

window.handleCredentialResponse = handleCredentialResponse;

logoutBtn.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Logout error:', error.message);
        return;
    }
    user = null;
    mangas = [];
    updateMangaList();
    updateUIOnLogout();
    showNotification('Você saiu da sua conta.');
});

supabase.auth.onAuthStateChange((_event, session) => {
    if (session && session.user) {
        user = session.user;
        updateUIOnLogin();
        loadFromSupabase();
    } else {
        user = null;
        mangas = [];
        updateMangaList();
        updateUIOnLogout();
    }
});

window.onload = async () => {
    setupModalEvents();

    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
        user = session.user;
        updateUIOnLogin();
        await loadFromSupabase();
    } else {
        updateUIOnLogout();
    }

    sortSelect.addEventListener('change', updateMangaList);
};

function updateUIOnLogin() {
    logoutBtn.style.display = 'inline-block';
    document.querySelector('.g_id_signin').style.display = 'none';
}

function updateUIOnLogout() {
    logoutBtn.style.display = 'none';
    document.querySelector('.g_id_signin').style.display = 'block';
}

// ---------- MANGA DATA HANDLING ----------

async function loadFromSupabase() {
    if (!user) return;

    const { data, error } = await supabase
        .from('user_readings')
        .select('*')
        .eq('user_id', user.id);

    if (error) {
        console.error('Error loading mangas from Supabase:', error);
        showNotification('Erro ao carregar mangás. Tente novamente.');
        return;
    }

    mangas = data.map(entry => ({
        id: entry.id,
        title: entry.manga_title,
        chapter: entry.chapter,
        status: entry.status || 'ongoing',
        link: entry.link,
        coverUrl: entry.manga_cover || 'https://via.placeholder.com/280x380?text=Sem+Capa',
        updatedAt: entry.updated_at,
    }));

    updateMangaList();
}

async function saveToSupabase() {
    if (!user) return;

    try {
        const mangaData = mangas.map(manga => ({
            id: manga.id,
            user_id: user.id,
            manga_title: manga.title,
            chapter: manga.chapter,
            status: manga.status,
            manga_cover: manga.coverUrl,
            link: manga.link,
            updated_at: manga.updatedAt || new Date().toISOString(),
        }));

        const { error } = await supabase.from('user_readings').upsert(mangaData, {
            onConflict: 'id'
        });

        if (error) {
            console.error('Error saving mangas:', error);
            showNotification('Erro ao salvar mangás. Tente novamente.');
        }
    } catch (e) {
        console.error('Error saving mangas:', e);
        showNotification('Erro ao salvar mangás. Tente novamente.');
    }
}

async function addManga() {
    if (!user) {
        showNotification('Faça login para adicionar mangás.');
        return;
    }

    const title = document.getElementById('manga-title').value.trim();
    const chapterInput = document.getElementById('manga-chapter').value.trim();
    const status = document.getElementById('manga-status').value;
    const link = document.getElementById('manga-link').value.trim() || '#';
    const coverUrlInput = document.getElementById('manga-cover-url').value.trim();

    if (!title) {
        showNotification('Preencha pelo menos o título!');
        return;
    }

    const chapter = parseInt(chapterInput);
    if (isNaN(chapter) || chapter < 0 || !Number.isInteger(chapter)) {
        showNotification('Capítulo deve ser um número inteiro positivo!');
        return;
    }

    if (coverUrlInput) {
        createMangaItem(title, chapter, status, link, coverUrlInput);
        return;
    }

    currentManga = { title, chapter, status, link };
    await searchCovers(title);
}

function createMangaItem(title, chapter, status, link, coverUrl) {
    const newManga = {
        id: crypto.randomUUID(),
        title,
        chapter,
        status: status || 'ongoing',
        link,
        coverUrl: coverUrl || 'https://via.placeholder.com/280x380?text=Sem+Capa',
        updatedAt: new Date().toISOString(),
    };

    mangas.unshift(newManga);
    saveToSupabase();
    updateMangaList();

    // Reset inputs
    document.getElementById('manga-title').value = '';
    document.getElementById('manga-chapter').value = '';
    document.getElementById('manga-link').value = '';
    document.getElementById('manga-cover-url').value = '';

    showNotification(`"${title}" adicionado à biblioteca!`);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: var(--primary);
                color: white;
                padding: 15px 25px;
                border-radius: var(--border-radius);
                box-shadow: var(--shadow);
                z-index: 1000;
                animation: fadeInOut 3s ease;
            `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s ease forwards';
        setTimeout(() => notification.remove(), 500);
    }, 2500);
}

function openEditModal(id) {
    mangaToEdit = mangas.find(m => m.id === id);
    if (!mangaToEdit) return;

    document.getElementById('edit-title').value = mangaToEdit.title;
    document.getElementById('edit-chapter').value = mangaToEdit.chapter;
    document.getElementById('edit-status').value = mangaToEdit.status;
    document.getElementById('edit-link').value = mangaToEdit.link;
    document.getElementById('edit-cover-url').value = mangaToEdit.coverUrl;

    document.getElementById('edit-modal').style.display = 'flex';
}

function saveMangaEdit() {
    if (!mangaToEdit) return;

    const title = document.getElementById('edit-title').value.trim();
    const chapter = parseInt(document.getElementById('edit-chapter').value);
    const status = document.getElementById('edit-status').value;
    const link = document.getElementById('edit-link').value.trim() || '#';
    const coverUrl = document.getElementById('edit-cover-url').value.trim();

    if (!title) {
        showNotification('Título não pode estar vazio!');
        return;
    }

    if (isNaN(chapter) || chapter < 0 || !Number.isInteger(chapter)) {
        showNotification('Capítulo deve ser um número inteiro positivo!');
        return;
    }

    mangaToEdit.title = title;
    mangaToEdit.chapter = chapter;
    mangaToEdit.status = status;
    mangaToEdit.link = link;
    mangaToEdit.coverUrl = coverUrl;
    mangaToEdit.updatedAt = new Date().toISOString();

    saveToSupabase();
    updateMangaList();
    showNotification(`"${title}" atualizado com sucesso!`);
    closeModal('edit-modal');
}

function removeManga(id) {
    const manga = mangas.find(m => m.id === id);
    if (!manga) return;

    if (!confirm(`Tem certeza que deseja remover "${manga.title}" da sua biblioteca?`)) return;

    mangas = mangas.filter(m => m.id !== id);
    saveToSupabase();
    updateMangaList();
    showNotification(`"${manga.title}" removido da biblioteca!`);
}

function updateMangaList() {
    const listElement = document.getElementById('manga-list');
    listElement.innerHTML = '';

    if (mangas.length === 0) {
        listElement.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-book-open"></i>
                        <h3>Sua biblioteca está vazia</h3>
                        <p>Adicione seu primeiro mangá para começar</p>
                    </div>`;
        return;
    }

    const sortedMangas = [...mangas];
    const sortOption = sortSelect.value;

    if (sortOption === 'title') {
        sortedMangas.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOption === 'chapter') {
        sortedMangas.sort((a, b) => b.chapter - a.chapter);
    } else if (sortOption === 'status') {
        const statusOrder = { 'ongoing': 1, 'hiatus': 2, 'finished': 3 };
        sortedMangas.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    } else {
        sortedMangas.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    sortedMangas.forEach(manga => {
        const mangaCard = document.createElement('div');
        mangaCard.className = 'manga-card';

        // Status badge class
        const statusClass = manga.status === 'hiatus' ? 'hiatus' :
            manga.status === 'finished' ? 'finished' : 'ongoing';

        mangaCard.innerHTML = `
                    <div class="manga-cover-container">
                        <img src="${manga.coverUrl}" alt="${manga.title}" class="manga-cover"
                             onerror="this.src='https://via.placeholder.com/280x380?text=Capa+Não+Disponível'">
                        <div class="chapter-badge ${statusClass}">Cap. ${manga.chapter}</div>
                        <div class="status-badge ${statusClass}">
                            ${manga.status === 'ongoing' ? 'Em Andamento' :
                manga.status === 'hiatus' ? 'Em Hiato' : 'Concluído'}
                        </div>
                    </div>
                    <div class="manga-info">
                        <h3 class="manga-title" title="${manga.title}">${manga.title}</h3>
                        <div class="manga-meta">
                            <span>${formatTimeAgo(manga.updatedAt)}</span>
                        </div>
                        <div class="manga-actions">
                            <a href="${manga.link}" target="_blank" class="secondary-btn">
                                <i class="fas fa-external-link-alt"></i> Ler
                            </a>
                            <button onclick="openEditModal('${manga.id}')" class="secondary-btn">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button onclick="removeManga('${manga.id}')" class="secondary-btn">
                                <i class="fas fa-trash"></i> Remover
                            </button>
                        </div>
                    </div>`;

        listElement.appendChild(mangaCard);
    });
}

// ---------- COVER SEARCH FUNCTIONS ----------

async function searchCovers(title) {
    const modal = document.getElementById('cover-modal');
    const resultsContainer = document.getElementById('cover-results');

    modal.style.display = 'flex';
    resultsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Buscando capas para "${title}"...</p>
        </div>`;

    try {
        const query = `"${title}" cover`;
        const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&searchType=image&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&num=8&excludeTerms=reddit tiktok book-pic book-pic`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            // Filter out TikTok results
            console.log(data);

            // For both searchCovers and searchCoversForEdit functions
            const filteredItems = data.items
                .map(item => {
                    // Make URL lowercase for case-insensitive matching
                    const lowerLink = item.link.toLowerCase();

                    // Check for valid image extensions
                    if (lowerLink.includes('.png') ||
                        lowerLink.includes('.jpg') ||
                        lowerLink.includes('.jpeg')) {

                        // Create a clean version of the URL without parameters
                        let cleanUrl = item.link;

                        // Remove everything after the image extension
                        const pngIndex = cleanUrl.toLowerCase().indexOf('.png');
                        const jpgIndex = cleanUrl.toLowerCase().indexOf('.jpg');
                        const jpegIndex = cleanUrl.toLowerCase().indexOf('.jpeg');

                        // Find the earliest valid extension position
                        const extensionPositions = [pngIndex, jpgIndex, jpegIndex]
                            .filter(pos => pos !== -1)
                            .sort((a, b) => a - b);

                        if (extensionPositions.length > 0) {
                            const firstValidPosition = extensionPositions[0];

                            // Determine the end position based on extension type
                            let endPosition = firstValidPosition + 4; // .png = 4 chars
                            if (cleanUrl.toLowerCase().substring(firstValidPosition, firstValidPosition + 5) === '.jpeg') {
                                endPosition = firstValidPosition + 5; // .jpeg = 5 chars
                            } else if (cleanUrl.toLowerCase().substring(firstValidPosition, firstValidPosition + 4) === '.jpg') {
                                endPosition = firstValidPosition + 4; // .jpg = 4 chars
                            }

                            // Create clean URL by slicing to the end of the extension
                            cleanUrl = cleanUrl.substring(0, endPosition);
                        }

                        // Return modified item with cleaned URL
                        return {
                            ...item,
                            link: cleanUrl
                        };
                    }
                    return null;
                })
                .filter(item => item !== null); // Remove non-matching items

            resultsContainer.innerHTML = '';

            if (filteredItems.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="loading-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Nenhuma capa válida encontrada para "${title}".</p>
                        <p>Por favor, tente outra pesquisa.</p>
                    </div>`;
                return;
            }

            filteredItems.forEach((item, index) => {
                const coverOption = document.createElement('div');
                coverOption.className = 'cover-option';
                coverOption.dataset.url = item.link;
                coverOption.innerHTML = `<img src="${item.link}" alt="Capa ${index + 1}" loading="lazy">`;
                coverOption.addEventListener('click', () => selectCover(item.link));
                resultsContainer.appendChild(coverOption);
            });
        } else {
            resultsContainer.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Nenhuma capa encontrada para "${title}".</p>
                    <p>Por favor, adicione manualmente.</p>
                </div>`;
        }
    } catch (error) {
        console.error('Erro na busca de capas:', error);
        resultsContainer.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ocorreu um erro ao buscar capas.</p>
                <p>Por favor, adicione manualmente.</p>
            </div>`;
    }
}

async function searchCoversForEdit() {
    const title = document.getElementById('edit-title').value.trim();
    if (!title) {
        showNotification('Digite um título para buscar capas');
        return;
    }

    const modal = document.getElementById('cover-modal');
    const resultsContainer = document.getElementById('cover-results');

    modal.style.display = 'flex';
    resultsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Buscando capas para "${title}"...</p>
        </div>`;

    try {
        const query = `"${title}" cover`;
        const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&searchType=image&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&num=8&excludeTerms=reddit tiktok book-pic book-pic`;

        const response = await fetch(url);
        const data = await response.json();
        console.log(data);

        if (data.items && data.items.length > 0) {
            // Filter out TikTok results
            // For both searchCovers and searchCoversForEdit functions
            const filteredItems = data.items
                .map(item => {
                    // Make URL lowercase for case-insensitive matching
                    const lowerLink = item.link.toLowerCase();

                    // Check for valid image extensions
                    if (lowerLink.includes('.png') ||
                        lowerLink.includes('.jpg') ||
                        lowerLink.includes('.jpeg')) {

                        // Create a clean version of the URL without parameters
                        let cleanUrl = item.link;

                        // Remove everything after the image extension
                        const pngIndex = cleanUrl.toLowerCase().indexOf('.png');
                        const jpgIndex = cleanUrl.toLowerCase().indexOf('.jpg');
                        const jpegIndex = cleanUrl.toLowerCase().indexOf('.jpeg');

                        // Find the earliest valid extension position
                        const extensionPositions = [pngIndex, jpgIndex, jpegIndex]
                            .filter(pos => pos !== -1)
                            .sort((a, b) => a - b);

                        if (extensionPositions.length > 0) {
                            const firstValidPosition = extensionPositions[0];

                            // Determine the end position based on extension type
                            let endPosition = firstValidPosition + 4; // .png = 4 chars
                            if (cleanUrl.toLowerCase().substring(firstValidPosition, firstValidPosition + 5) === '.jpeg') {
                                endPosition = firstValidPosition + 5; // .jpeg = 5 chars
                            } else if (cleanUrl.toLowerCase().substring(firstValidPosition, firstValidPosition + 4) === '.jpg') {
                                endPosition = firstValidPosition + 4; // .jpg = 4 chars
                            }

                            // Create clean URL by slicing to the end of the extension
                            cleanUrl = cleanUrl.substring(0, endPosition);
                        }

                        // Return modified item with cleaned URL
                        return {
                            ...item,
                            link: cleanUrl
                        };
                    }
                    return null;
                })
                .filter(item => item !== null); // Remove non-matching items

            resultsContainer.innerHTML = '';

            if (filteredItems.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="loading-state">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Nenhuma capa válida encontrada para "${title}".</p>
                        <p>Por favor, tente outra pesquisa.</p>
                    </div>`;
                return;
            }

            filteredItems.forEach((item, index) => {
                const coverOption = document.createElement('div');
                coverOption.className = 'cover-option';
                coverOption.dataset.url = item.link;
                coverOption.innerHTML = `<img src="${item.link}" alt="Capa ${index + 1}" loading="lazy">`;
                coverOption.addEventListener('click', () => {
                    // Set the cover URL in the edit form
                    document.getElementById('edit-cover-url').value = item.link;

                    // Close the cover modal after selection
                    closeModal('cover-modal');
                });
                resultsContainer.appendChild(coverOption);
            });
        } else {
            resultsContainer.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Nenhuma capa encontrada para "${title}".</p>
                    <p>Por favor, adicione manualmente.</p>
                </div>`;
        }
    } catch (error) {
        console.error('Erro na busca de capas:', error);
        resultsContainer.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ocorreu um erro ao buscar capas.</p>
                <p>Por favor, adicione manualmente.</p>
            </div>`;
    }
}

function selectCover(url) {
    document.querySelectorAll('.cover-option').forEach(opt => opt.classList.remove('selected'));
    const selectedOption = document.querySelector(`.cover-option[data-url="${url}"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
        selectedCoverUrl = url;
    }
}

// ---------- MODAL MANAGEMENT ----------

function setupModalEvents() {
    // Cover modal
    const coverModal = document.getElementById('cover-modal');
    const coverCloseBtn = coverModal.querySelector('.close');
    const cancelCoverBtn = document.getElementById('cancel-cover');
    const confirmCoverBtn = document.getElementById('confirm-cover');

    coverCloseBtn.addEventListener('click', () => closeModal('cover-modal'));
    cancelCoverBtn.addEventListener('click', () => closeModal('cover-modal'));
    window.addEventListener('click', (e) => {
        if (e.target === coverModal) closeModal('cover-modal');
    });
    confirmCoverBtn.addEventListener('click', () => {
        if (currentManga && selectedCoverUrl) {
            createMangaItem(
                currentManga.title,
                currentManga.chapter,
                currentManga.status,
                currentManga.link,
                selectedCoverUrl
            );
        }
        closeModal('cover-modal');
    });

    // Edit modal
    const editModal = document.getElementById('edit-modal');
    const editCloseBtn = editModal.querySelector('.close');
    const cancelEditBtn = document.getElementById('cancel-edit');
    const saveEditBtn = document.getElementById('save-edit');

    editCloseBtn.addEventListener('click', () => closeModal('edit-modal'));
    cancelEditBtn.addEventListener('click', () => closeModal('edit-modal'));
    window.addEventListener('click', (e) => {
        if (e.target === editModal) closeModal('edit-modal');
    });
    saveEditBtn.addEventListener('click', saveMangaEdit);
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    currentManga = null;
    selectedCoverUrl = null;
}

// ---------- UTILS ----------

function formatDate(date) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(date).toLocaleDateString('pt-BR', options);
}

function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'agora mesmo';
    if (minutes < 60) {
        return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
    }
    if (hours < 24) {
        if (hours === 1) return '1 hora atrás';
        return `${hours} horas atrás`;
    }
    if (days === 1) return 'ontem';
    if (days < 7) return `${days} dias atrás`;
    return formatDate(date);
}

// Add CSS for notification animation
const style = document.createElement('style');
style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(20px); }
                10% { opacity: 1; transform: translateY(0); }
                90% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(20px); }
            }
            @keyframes fadeOut {
                to { opacity: 0; transform: translateY(20px); }
            }
        `;
document.head.appendChild(style);