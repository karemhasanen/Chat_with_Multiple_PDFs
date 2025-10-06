document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseFilesLink = document.getElementById('browse-files');
    const uploadStatus = document.getElementById('upload-status');
    const uploadView = document.getElementById('upload-view');
    const chatView = document.getElementById('chat-view');
    const chatContainer = document.getElementById('chat-container');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    
    const featuresGrid = document.querySelector('.features-grid');
    const filePreviewSection = document.getElementById('file-preview-section');
    const fileList = document.getElementById('file-list');
    const processButton = document.getElementById('process-button');

    const API_BASE_URL = 'http://127.0.0.1:8000';
    let selectedFiles = []; 

    // --- File Selection Logic ---

    browseFilesLink.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            displaySelectedFiles(fileInput.files);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            displaySelectedFiles(e.dataTransfer.files);
        }
    });

    function displaySelectedFiles(files) {
        selectedFiles = Array.from(files);
        fileList.innerHTML = ''; 
        
        if (selectedFiles.length > 0) {
            featuresGrid.classList.add('hidden'); 
            filePreviewSection.classList.remove('hidden'); 

            selectedFiles.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.textContent = file.name;
                fileList.appendChild(fileItem);
            });
        } else {
            featuresGrid.classList.remove('hidden');
            filePreviewSection.classList.add('hidden');
        }
    }

    // --- File Processing Logic ---

    processButton.addEventListener('click', () => {
        if (selectedFiles.length > 0) {
            uploadAndProcessFiles(selectedFiles);
        }
    });
    
    async function uploadAndProcessFiles(files) {
        uploadStatus.textContent = 'Uploading and processing...';
        uploadStatus.className = '';
        processButton.disabled = true;
        processButton.textContent = 'Processing...';

        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }

        try {
            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'An unknown error occurred.');
            }
            
            uploadStatus.textContent = "Success! Starting chat...";
            uploadStatus.classList.add('success');
            
            setTimeout(() => {
                uploadView.classList.add('hidden');
                chatView.classList.remove('hidden');
                addMessageToChat('bot', result.message);
            }, 1000);

        } catch (error) {
            uploadStatus.textContent = `Error: ${error.message}`;
            uploadStatus.classList.add('error');
        } finally {
            processButton.disabled = false;
            processButton.textContent = 'Process Documents';
        }
    }

    // --- Chat Logic ---

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userQuestion = chatInput.value.trim();
        if (!userQuestion) return;

        addMessageToChat('user', userQuestion);
        chatInput.value = '';
        sendButton.disabled = true;
        
        const thinkingMessage = addMessageToChat('bot', 'Thinking...');

        try {
            const response = await fetch(`${API_BASE_URL}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: userQuestion }),
            });

            const result = await response.json();
            thinkingMessage.remove();

            if (!response.ok) {
                throw new Error(result.detail || 'An error occurred.');
            }

            addMessageToChat('bot', result.answer);

        } catch (error) {
            thinkingMessage.remove();
            addMessageToChat('bot', `Sorry, an error occurred: ${error.message}`);
        } finally {
            sendButton.disabled = false;
        }
    });

    // --- UPDATED: Robust Markdown to HTML converter ---
    function formatMessage(message) {
        const lines = message.split('\n');
        let html = '';
        let listType = null;

        for (const line of lines) {
            // First, handle bolding on the entire line
            let formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            const isNumberedItem = /^\s*\d+\.\s/.test(formattedLine);
            const isBulletedItem = /^\s*[\*•-]\s/.test(formattedLine);

            if (isNumberedItem) {
                if (listType !== 'ol') {
                    if (listType) html += `</${listType}>`; // Close previous list
                    html += '<ol>';
                    listType = 'ol';
                }
                html += `<li>${formattedLine.replace(/^\s*\d+\.\s/, '')}</li>`;
            } else if (isBulletedItem) {
                if (listType !== 'ul') {
                    if (listType) html += `</${listType}>`; // Close previous list
                    html += '<ul>';
                    listType = 'ul';
                }
                html += `<li>${formattedLine.replace(/^\s*[\*•-]\s/, '')}</li>`;
            } else {
                if (listType) {
                    html += `</${listType}>`; // Close any open list
                    listType = null;
                }
                // Add non-list lines as paragraphs, preserving empty lines
                if (formattedLine.trim() === '') {
                    html += '<br>';
                } else {
                    html += `<p>${formattedLine}</p>`;
                }
            }
        }

        if (listType) {
            html += `</${listType}>`; // Close any remaining open list
        }

        return html.replace(/<p><\/p>/g, ''); // Clean up empty paragraphs
    }

    function addMessageToChat(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', sender === 'user' ? 'user-message' : 'bot-message');
        
        if (sender === 'bot') {
            messageElement.innerHTML = formatMessage(message);
        } else {
            // User messages should not be formatted
            messageElement.textContent = message;
        }
        
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return messageElement;
    }
});

