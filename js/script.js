// Configurações da API do Google
const GOOGLE_API_KEY = 'AIzaSyADAtYJz0IT0bnLZkiTSS0ND7MbwRbzqKo'; // Substitua pela sua chave
const GOOGLE_CX = '1047ca13cc6044e1b'; // Substitua pelo seu Search Engine ID

// Variáveis globais
let mangas = JSON.parse(localStorage.getItem('mangas')) || [];
let currentManga = null;
let selectedCoverUrl = null;

// Formata a data para exibição
function formatDate(date) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(date).toLocaleDateString('pt-BR', options);
}

// Formata o tempo decorrido (ex: "6 horas atrás")
function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes} min atrás`;
    if (hours < 24) return `${hours} horas atrás`;
    if (days === 1) return 'ontem';
    if (days < 7) return `${days} dias atrás`;
    return formatDate(date);
}

// Adiciona um novo mangá
async function addManga() {
    const title = document.getElementById('manga-title').value.trim();
    const chapter = document.getElementById('manga-chapter').value;
    const link = document.getElementById('manga-link').value.trim() || "#";
    const coverUrlInput = document.getElementById('manga-cover-url').value.trim();

    if (title && chapter) {
        // Se já tem uma URL de capa, adiciona diretamente
        if (coverUrlInput) {
            createMangaItem(title, chapter, link, coverUrlInput);
            return;
        }
        
        // Senão, busca capas automaticamente
        currentManga = { title, chapter, link };
        await searchCovers(title);
    } else {
        alert("Preencha pelo menos o título e o capítulo!");
    }
}

// Busca capas no Google Images
async function searchCovers(title) {
    const modal = document.getElementById('cover-modal');
    const resultsContainer = document.getElementById('cover-results');
    
    // Mostra o modal
    modal.style.display = 'block';
    resultsContainer.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Buscando capas para "${title}"...</p>
        </div>
    `;
    
    try {
        const query = `Capa "${title}" manga OR manhwa OR comic`;
        const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&searchType=image&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&num=8`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            resultsContainer.innerHTML = '';
            data.items.forEach((item, index) => {
                const coverOption = document.createElement('div');
                coverOption.className = 'cover-option';
                coverOption.dataset.url = item.link;
                coverOption.innerHTML = `<img src="${item.link}" alt="Capa ${index + 1}">`;
                coverOption.addEventListener('click', () => selectCover(item.link));
                resultsContainer.appendChild(coverOption);
            });
        } else {
            resultsContainer.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Nenhuma capa encontrada para "${title}".</p>
                    <p>Por favor, adicione manualmente.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro na busca de capas:', error);
        resultsContainer.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ocorreu um erro ao buscar capas.</p>
                <p>Por favor, adicione manualmente.</p>
            </div>
        `;
    }
}

// Seleciona uma capa no modal
function selectCover(url) {
    // Remove a seleção anterior
    document.querySelectorAll('.cover-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Adiciona a seleção nova
    const selectedOption = document.querySelector(`.cover-option[data-url="${url}"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
        selectedCoverUrl = url;
    }
}

// Cria o item do mangá na lista
function createMangaItem(title, chapter, link, coverUrl) {
    const newManga = {
        id: Date.now(),
        title: title,
        chapter: chapter,
        link: link,
        coverUrl: coverUrl || 'https://via.placeholder.com/280x380?text=Sem+Capa',
        updatedAt: new Date().toISOString()
    };

    mangas.unshift(newManga);
    saveToLocalStorage();
    updateMangaList();
    
    // Limpa os campos
    document.getElementById('manga-title').value = '';
    document.getElementById('manga-chapter').value = '';
    document.getElementById('manga-link').value = '';
    document.getElementById('manga-cover-url').value = '';
}

// Atualiza o capítulo de um mangá
function updateChapter(id) {
    const manga = mangas.find(m => m.id === id);
    if (!manga) return;

    const newChapter = prompt(`Atualizar capítulo para ${manga.title}:\nCapítulo atual: ${manga.chapter}`);
    if (newChapter && !isNaN(newChapter)) {
        manga.chapter = newChapter;
        manga.updatedAt = new Date().toISOString();
        saveToLocalStorage();
        updateMangaList();
    }
}

// Remove um mangá da lista
function removeManga(id) {
    if (confirm(`Tem certeza que deseja remover este mangá da sua biblioteca?`)) {
        mangas = mangas.filter(m => m.id !== id);
        saveToLocalStorage();
        updateMangaList();
    }
}

// Salva no localStorage
function saveToLocalStorage() {
    localStorage.setItem('mangas', JSON.stringify(mangas));
}

// Atualiza a lista de mangás na tela
function updateMangaList() {
    const listElement = document.getElementById('manga-list');
    listElement.innerHTML = '';

    if (mangas.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book-open"></i>
                <h3>Sua biblioteca está vazia</h3>
                <p>Adicione seu primeiro mangá para começar</p>
            </div>
        `;
        return;
    }

    mangas.forEach(manga => {
        const mangaCard = document.createElement('div');
        mangaCard.className = 'manga-card';
        
        mangaCard.innerHTML = `
            <div class="manga-cover-container">
                <img src="${manga.coverUrl}" alt="${manga.title}" class="manga-cover" 
                     onerror="this.src='https://via.placeholder.com/280x380?text=Capa+Não+Disponível'">
                <div class="chapter-badge">Cap. ${manga.chapter}</div>
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
                    <button onclick="updateChapter(${manga.id})" class="secondary-btn">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </div>
            </div>
        `;
        
        listElement.appendChild(mangaCard);
    });
}

// Configura os eventos do modal
function setupModalEvents() {
    const modal = document.getElementById('cover-modal');
    const closeBtn = document.querySelector('.close');
    const cancelBtn = document.getElementById('cancel-cover');
    const confirmBtn = document.getElementById('confirm-cover');
    
    // Fecha o modal ao clicar no X
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        currentManga = null;
        selectedCoverUrl = null;
    });
    
    // Fecha o modal ao clicar no Cancelar
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        currentManga = null;
        selectedCoverUrl = null;
    });
    
    // Fecha o modal ao clicar fora
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
            currentManga = null;
            selectedCoverUrl = null;
        }
    });
    
    // Confirma a seleção
    confirmBtn.addEventListener('click', () => {
        if (currentManga && selectedCoverUrl) {
            createMangaItem(
                currentManga.title,
                currentManga.chapter,
                currentManga.link,
                selectedCoverUrl
            );
        }
        modal.style.display = 'none';
        currentManga = null;
        selectedCoverUrl = null;
    });
}

// Inicializa a aplicação
window.onload = function() {
    setupModalEvents();
    updateMangaList();
};