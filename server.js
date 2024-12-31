import express from 'express';
import youtubedl from 'youtube-dl-exec';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static('./'));

// Video indirme klasörü oluştur
const downloadDir = path.join(__dirname, 'downloads');
try {
    fs.mkdirSync(downloadDir, { recursive: true });
} catch (err) {
    if (err.code !== 'EEXIST') {
        console.error('Klasör oluşturma hatası:', err);
    }
}

// İndirme durumlarını takip etmek için
const downloadStatus = new Map();

function getFormatString(quality, format) {
    if (format === 'audio') {
        const audioFormats = {
            'best': 'bestaudio[ext=m4a]/bestaudio',
            'medium': 'bestaudio[abr<=128]/bestaudio',
            'low': 'worstaudio'
        };
        return audioFormats[quality] || audioFormats['best'];
    } else {
        const videoFormats = {
            'highest': 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4] / bv*+ba/b',
            '1080': 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]',
            '720': 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]',
            '480': 'bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]',
            '360': 'bv*[height<=360][ext=mp4]+ba[ext=m4a]/b[height<=360][ext=mp4]'
        };
        return videoFormats[quality] || videoFormats['highest'];
    }
}

function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// İndirme durumunu kontrol eden endpoint
app.get('/download-status/:videoId', (req, res) => {
    const status = downloadStatus.get(req.params.videoId) || { progress: 0, status: 'waiting' };
    res.json(status);
});

app.post('/download', async (req, res) => {
    try {
        const { url, quality, format } = req.body;
        
        if (!url) {
            return res.status(400).send('URL gerekli');
        }

        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).send('Geçersiz YouTube URL\'si');
        }

        // Dosya yolu
        const extension = format === 'audio' ? 'mp3' : 'mp4';
        const outputPath = path.join(downloadDir, `${videoId}_${quality}.${extension}`);
        
        // İndirme durumunu başlat
        downloadStatus.set(videoId, { progress: 0, status: 'downloading' });

        try {
            // Format seçeneğine göre indir
            const formatString = getFormatString(quality, format);
            
            // İlerlemeyi takip et
            let lastProgress = 0;
            
            const options = {
                output: outputPath,
                format: formatString,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                ],
                progress: true,
                callback: (progress) => {
                    if (progress.percent) {
                        const currentProgress = Math.round(progress.percent);
                        if (currentProgress !== lastProgress) {
                            lastProgress = currentProgress;
                            downloadStatus.set(videoId, {
                                progress: currentProgress,
                                status: 'downloading',
                                speed: progress.speed,
                                eta: progress.eta
                            });
                        }
                    }
                }
            };

            // Ses dosyası için ek ayarlar
            if (format === 'audio') {
                options.extractAudio = true;
                options.audioFormat = 'mp3';
                options.audioQuality = quality === 'best' ? '0' : quality === 'medium' ? '5' : '9';
            } else {
                options.mergeOutputFormat = 'mp4';
            }

            await youtubedl(url, options);

            // Dosya var mı kontrol et
            if (!fs.existsSync(outputPath)) {
                throw new Error(format === 'audio' ? 'Ses dosyası indirilemedi' : 'Video indirilemedi');
            }

            // İndirme durumunu güncelle
            downloadStatus.set(videoId, { progress: 100, status: 'completed' });

            // Dosyayı kullanıcıya gönder
            res.download(outputPath, `${format === 'audio' ? 'audio' : 'video'}_${videoId}.${extension}`, (err) => {
                if (err) {
                    console.error('Dosya gönderme hatası:', err);
                    res.status(500).send('Dosya gönderme hatası');
                }
                // İndirme tamamlandıktan sonra dosyayı ve durumu sil
                fs.unlink(outputPath, (err) => {
                    if (err) console.error('Dosya silme hatası:', err);
                });
                downloadStatus.delete(videoId);
            });
        } catch (error) {
            console.error('İndirme hatası:', error);
            downloadStatus.set(videoId, { progress: 0, status: 'error', error: error.message });
            res.status(500).send('İndirme hatası: ' + error.message);
            
            // Hata durumunda dosyayı temizle
            if (fs.existsSync(outputPath)) {
                fs.unlink(outputPath, (err) => {
                    if (err) console.error('Hata sonrası dosya silme hatası:', err);
                });
            }
        }
    } catch (error) {
        console.error('Genel hata:', error);
        res.status(500).send('İşlem hatası');
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Sunucu http://0.0.0.0:${port} adresinde çalışıyor`);
    console.log(`İndirilen dosyalar ${downloadDir} klasörüne kaydedilecek`);
}); 