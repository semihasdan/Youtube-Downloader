let downloadInterval;
let currentFormat = 'video';

function selectFormat(format) {
    currentFormat = format;
    document.getElementById('videoFormat').classList.toggle('active', format === 'video');
    document.getElementById('audioFormat').classList.toggle('active', format === 'audio');
    document.getElementById('videoQualityOptions').classList.toggle('show', format === 'video');
    document.getElementById('audioQualityOptions').classList.toggle('show', format === 'audio');
}

async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value;
    const videoQuality = document.getElementById('videoQuality').value;
    const audioQuality = document.getElementById('audioQuality').value;
    const resultDiv = document.getElementById('result');
    const downloadButton = document.getElementById('downloadButton');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const downloadInfo = document.getElementById('downloadInfo');
    
    if (!videoUrl) {
        showMessage('Lütfen bir YouTube URL\'si girin', false);
        return;
    }

    if (!isValidYoutubeUrl(videoUrl)) {
        showMessage('Geçerli bir YouTube URL\'si girin', false);
        return;
    }

    try {
        // UI'ı hazırla
        downloadButton.disabled = true;
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = '%0';
        downloadInfo.textContent = 'İndirme başlatılıyor...';
        showMessage(`${currentFormat === 'video' ? 'Video' : 'Ses dosyası'} indiriliyor...`, true);

        const videoId = extractVideoId(videoUrl);
        
        // İndirme durumunu takip et
        startProgressTracking(videoId, progressFill, progressText, downloadInfo);
        
        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                url: videoUrl,
                quality: currentFormat === 'video' ? videoQuality : audioQuality,
                format: currentFormat
            })
        });

        if (!response.ok) {
            throw new Error(currentFormat === 'video' ? 'Video indirilemedi' : 'Ses dosyası indirilemedi');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = currentFormat === 'video' ? 
            `video_${videoId}.mp4` : 
            `audio_${videoId}.mp3`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);

        showMessage(currentFormat === 'video' ? 
            'Video başarıyla indirildi!' : 
            'Ses dosyası başarıyla indirildi!', true);
    } catch (error) {
        showMessage('Hata: ' + error.message, false);
    } finally {
        // Temizlik
        downloadButton.disabled = false;
        stopProgressTracking();
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 3001);
    }
}

function startProgressTracking(videoId, progressFill, progressText, downloadInfo) {
    stopProgressTracking();
    
    downloadInterval = setInterval(async () => {
        try {
            const response = await fetch(`/download-status/${videoId}`);
            const status = await response.json();
            
            if (status.status === 'error') {
                stopProgressTracking();
                return;
            }
            
            const progress = status.progress || 0;
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `%${progress}`;
            
            if (status.speed && status.eta) {
                downloadInfo.textContent = `Hız: ${formatSpeed(status.speed)} - Kalan Süre: ${formatTime(status.eta)}`;
            }
            
            if (status.status === 'completed' || progress >= 100) {
                stopProgressTracking();
            }
        } catch (error) {
            console.error('İlerleme takip hatası:', error);
        }
    }, 1000);
}

function stopProgressTracking() {
    if (downloadInterval) {
        clearInterval(downloadInterval);
        downloadInterval = null;
    }
}

function formatSpeed(speed) {
    if (!speed) return 'Hesaplanıyor...';
    const mbps = (speed / (1024 * 1024)).toFixed(2);
    return `${mbps} MB/s`;
}

function formatTime(seconds) {
    if (!seconds) return 'Hesaplanıyor...';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function isValidYoutubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
}

function showMessage(message, isSuccess) {
    const resultDiv = document.getElementById('result');
    resultDiv.textContent = message;
    resultDiv.style.display = 'block';
    resultDiv.className = isSuccess ? 'success' : 'error';
} 