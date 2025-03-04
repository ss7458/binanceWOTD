class WordleSolver {
    constructor(wordLength) {
       
        this.wordLength = wordLength; // 单词长度
        this.possibleWords = [];// 当前可能的单词列表
        this.allWords = []; // 所有可用的单词列表
        this.onProgressUpdate = null; // 进度更新回调函数
        this.debug = true; // 调试开关
        this.entropyCache = null; // 信息熵计算结果缓存
        this.entropyCacheHistory = []; // 历史缓存记录，用于撤销操作后恢复
        this.currentWord = '';        // 当前选中的单词
        this.currentCellIndex = 0;        // 当前选中的单元格索引
        // 存储当前最优解列表和索引
        this.topGuesses = []; // 用于存储计算出的最优猜测词列表
        this.currentGuessIndex = 0; // 当前使用的猜测词在列表中的索引位置
    }

    // 调试日志输出
    log(message, data = null) {
        if (this.debug) {
            const timestamp = new Date().toISOString();
            const logMessage = `[Wordle Solver ${timestamp}] ${message}`;
            console.log(logMessage);
            if (data !== null) {
                console.log('Debug data:', data);
            }
        }
    }

    // 更新加载进度
    updateProgress(progress, stage = '') {
        if (this.onProgressUpdate) {
            // 确保进度值在0-100之间
            const normalizedProgress = Math.min(100, Math.max(0, progress));
            
            // 定义各阶段的进度范围
            const stages = {
                '正在加载缓存': { start: 0, range: 20 },
                '正在验证缓存': { start: 20, range: 15 },
                '正在初始化单词列表': { start: 35, range: 25 },
                '正在计算信息熵': { start: 60, range: 40 },
                '正在下载单词列表': { start: 0, range: 40 },
                '正在解码文件内容': { start: 40, range: 10 },
                '正在处理单词': { start: 50, range: 20 }
            };

            // 查找当前阶段
            for (const [key, { start, range }] of Object.entries(stages)) {
                if (stage.includes(key)) {
                    const adjustedProgress = start + Math.floor((normalizedProgress * range) / 100);
                    this.onProgressUpdate(adjustedProgress, `${stage}(${normalizedProgress}%)`);
                    return;
                }
            }

            // 其他情况直接显示原始进度
            this.onProgressUpdate(normalizedProgress, `${stage}(${normalizedProgress}%)`);
        }
    }


    // 计算猜测词与目标词之间的相似度
    calculatePattern(guess, target) {
        // this.log(`计算模式 - 猜测词: ${guess}, 目标词: ${target}`);
        //合计分数
        const pattern = new Array(this.wordLength).fill(0);
        // 用于统计目标词中每个字母出现的次数
        const targetLetterCounts = new Array(26).fill(0);
         // const guessLetterCounts = {};

        // 统计单词中每个字母的出现次数
        for (let i = 0; i < this.wordLength; i++) {
            targetLetterCounts[target.charCodeAt(i) - 97]++;
        }

        // 首先标记所有正确位置的字母（绿色）
        for (let i = 0; i < this.wordLength; i++) {
            if (guess[i] === target[i]) {
                pattern[i] = '2';
                targetLetterCounts[guess.charCodeAt(i) - 97]--;
            }
        }

        // 然后标记位置错误的字母（黄色）
        for (let i = 0; i < this.wordLength; i++) {
            if (pattern[i] !== '2') {
                const charIndex = guess.charCodeAt(i) - 97;
                if (targetLetterCounts[charIndex] > 0) {
                    pattern[i] = '1';
                    targetLetterCounts[charIndex]--;
                }
            }
        }

        const result = pattern.join('');
        // this.log(`模式计算结果: ${result}`);
        return result;
    }

    // 计算猜测词的信息熵
    calculateEntropy(guess) {
        this.log(`计算熵值 - 猜测词: ${guess}`);
        const patternCounts = {};
        const totalWords = this.possibleWords.length;

        // 使用Map来优化模式统计
        const patternMap = new Map();
        for (const target of this.possibleWords) {
            const pattern = this.calculatePattern(guess, target);
            patternMap.set(pattern, (patternMap.get(pattern) || 0) + 1);
        }

        // 计算信息熵
        let entropy = 0;
        for (const [pattern, count] of patternMap) {
            const probability = count / totalWords;
            entropy -= probability * Math.log2(probability);
        }

        this.log(`熵值计算结果: ${entropy}`, { guess, patternCounts: Object.fromEntries(patternMap) });
        return entropy;
    }

    async getBestGuess() {
        this.log(`开始获取最佳猜测词 - 当前可能词数量: ${this.possibleWords.length}`);
        if (this.possibleWords.length === 0) return '';
        if (this.possibleWords.length === 1) {
            this.log(`找到唯一可能的单词: ${this.possibleWords[0]}`);
            // 自动设置所有格子为绿色
            const feedbackCells = document.querySelectorAll('.feedback-cell');
            feedbackCells.forEach(cell => {
                cell.className = 'feedback-cell pattern-2';
            });
            return this.possibleWords[0];
        }
        if (this.possibleWords.length === 2) return this.possibleWords[0];

        // 获取前8个最优解
        this.updateProgress(0, '正在计算信息熵...');
        const topGuesses = await this.getTopGuesses(8);
        this.updateProgress(100, '计算完成');
        return topGuesses[0];
    }

    // 获取前N个最优解
    async getTopGuesses(n = 8) {
        this.log(`获取前${n}个最优解`);

        // 验证缓存的有效性
        if (this.entropyCache) {
            // 检查缓存的单词是否都在当前可能词列表中
            const isValidCache = this.entropyCache.some(word =>
                this.possibleWords.includes(word)
            );

            if (isValidCache) {
                this.log('使用有效的缓存计算结果');
                // 根据当前可能词列表过滤缓存结果
                const sortedCache = this.entropyCache
                    .filter(word => this.possibleWords.includes(word));
                
                if (sortedCache.length > 0) {
                    return sortedCache.slice(0, Math.min(n, sortedCache.length));
                }
            } else {
                this.log('缓存已失效，需要重新计算');
                this.entropyCache = null;
            }
        }

        const wordEntropies = [];

        // 根据可能词数量选择搜索范围
        const maxCandidates = 2000;
        let candidateWords = this.possibleWords.length <= 10 ? [...new Set(this.possibleWords)] :
            (this.possibleWords.length > maxCandidates
                ? [...new Set([...this.possibleWords.slice(0, maxCandidates / 2), ...this.allWords.slice(0, maxCandidates / 2)])]
                : [...new Set(this.allWords)]);
        // 只从可能词列表中选择，而不是从所有词中选择
        // let candidateWords = this.possibleWords;

        // 计算每个候选词的信息熵
        const batchSize = 50;
        const originalDebugState = this.debug;
        const totalWords = candidateWords.length;
        let processedWords = 0;
        let lastProgressUpdate = 0;

        try {
            this.debug = false;
            // 初始化进度
            this.updateProgress(0, '正在计算信息熵...');

            for (let i = 0; i < candidateWords.length; i += batchSize) {
                const batch = candidateWords.slice(i, Math.min(i + batchSize, candidateWords.length));
                for (const word of batch) {
                    const entropy = this.calculateEntropy(word);
                    // 改进的使用频率权重：根据词在可能词列表中的位置调整权重
                    const positionIndex = this.possibleWords.indexOf(word);
                    const frequencyWeight = positionIndex !== -1
                        ? 1.2 + (0.1 * (1 - positionIndex / this.possibleWords.length))
                        : 1.0;
                    const score = entropy * frequencyWeight;
                    wordEntropies.push({ word, score });

                    // 更新进度
                    processedWords++;
                    const currentProgress = Math.floor((processedWords / totalWords) * 100);

                    // 只在进度发生显著变化时更新显示
                    if (currentProgress > lastProgressUpdate) {
                        lastProgressUpdate = currentProgress;
                        this.updateProgress(currentProgress, `正在计算信息熵...${currentProgress}%`);
                    }
                }

                // 让出主线程，避免界面卡顿
                if (i + batchSize < candidateWords.length) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // 按信息熵降序排序
            const sortedResults = wordEntropies
                .sort((a, b) => b.score - a.score)
                .map(item => item.word);

            // 缓存计算结果
            this.entropyCache = sortedResults;

            return sortedResults.slice(0, Math.min(n, sortedResults.length));
        } finally {
            this.debug = originalDebugState;
        }
    }

    // 更新可能的单词列表
    updatePossibleWords(guess, pattern) {
        this.log(`更新可能词列表 - 猜测词: ${guess}, 模式: ${pattern}`);
        const oldCount = this.possibleWords.length;
        
        // 在更新可能词列表前，保存当前的熵缓存到历史记录中
        if (this.entropyCache) {
            this.entropyCacheHistory.push([...this.entropyCache]);
        }
        
        const newPossibleWords = this.possibleWords.filter(word =>
            this.calculatePattern(guess, word) === pattern
        );

        // 确保新的可能单词列表不为空
        if (newPossibleWords.length === 0) {
            this.log('警告：筛选后没有符合条件的单词');
            // 保持原有可能单词列表不变
            return false;
        }

        this.possibleWords = newPossibleWords;
        // 清除信息熵缓存，因为可能词列表已更新
        this.entropyCache = null;
        this.log(`可能词列表已更新 - 之前: ${oldCount}, 之后: ${this.possibleWords.length}`);
        return true;
    }



    // 从可能的单词列表中手动选择单词
    selectFromPossibleWords() {
        if (!this.possibleWords || this.possibleWords.length === 0) {
            alert('当前没有可选择的单词');
            return;
        }

        // 创建单词选择弹窗
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 1000; max-height: 85vh; overflow-y: auto; min-width: 450px; display: flex; flex-direction: column; align-items: center;';

        const title = document.createElement('h3');
        title.textContent = '选择单词';
        title.style.cssText = 'margin-bottom: 20px; color: #2196F3; text-align: center; width: 100%; font-size: 24px;';
        modal.appendChild(title);

        // 添加搜索框
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = 'width: 100%; max-width: 400px; margin-bottom: 20px; display: flex; justify-content: center;';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '搜索单词...';
        searchInput.style.cssText = 'width: 100%; padding: 12px; border: 2px solid #e3f2fd; border-radius: 8px; font-size: 16px; transition: all 0.3s ease; text-align: center;';
        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = '#2196F3';
            searchInput.style.boxShadow = '0 0 0 3px rgba(33, 150, 243, 0.1)';
        });
        searchInput.addEventListener('blur', () => {
            searchInput.style.borderColor = '#e3f2fd';
            searchInput.style.boxShadow = 'none';
        });
        searchContainer.appendChild(searchInput);
        modal.appendChild(searchContainer);

        const wordContainer = document.createElement('div');
        wordContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 6px; margin: 15px 0; max-height: 50vh; overflow-y: auto; padding: 8px; width: 100%; justify-items: stretch;';

        // 创建单词按钮的函数
        // 在外部作用域捕获this值
        const self = this;
        function createWordButtons(words) {
            wordContainer.innerHTML = '';
            words.forEach(word => {
                const wordButton = document.createElement('button');
                wordButton.textContent = word.toUpperCase();
                wordButton.style.cssText = 'padding: 6px 4px; border: none; border-radius: 4px; background: #2196F3; color: white; cursor: pointer; transition: all 0.2s; font-size: 14px; text-align: center; width: 100%;';
                wordButton.onmouseover = () => wordButton.style.background = '#1976D2';
                wordButton.onmouseout = () => wordButton.style.background = '#2196F3';
                wordButton.onclick = () => {
                    self.currentWord = word;
                    window.currentWord = word; // 保持全局变量同步
                    document.getElementById('result').innerHTML = `已选择: ${word.toUpperCase()}`;
                    document.body.removeChild(modal);
                    self.createFeedbackGrid();
                };
                wordContainer.appendChild(wordButton);
            });
        }

        // 初始显示所有单词
        createWordButtons(this.possibleWords);
        modal.appendChild(wordContainer);

        // 添加搜索功能
        searchInput.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredWords = this.possibleWords.filter(word =>
                word.toLowerCase().includes(searchTerm)
            );
            createWordButtons(filteredWords);
        };

        // 添加底部按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: center; gap: 10px; margin-top: 10px; width: 100%;';

        const closeButton = document.createElement('button');
        closeButton.textContent = '关闭';
        closeButton.style.cssText = 'padding: 8px 16px; border: none; border-radius: 4px; background: #2196F3; color: white; cursor: pointer; font-size: 14px; transition: all 0.3s ease; min-width: 80px;';
        closeButton.onmouseover = () => closeButton.style.background = '#1976D2';
        closeButton.onmouseout = () => closeButton.style.background = '#2196F3';
        closeButton.onclick = () => document.body.removeChild(modal);
        buttonContainer.appendChild(closeButton);

        modal.appendChild(buttonContainer);

        // 添加点击外部关闭功能
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };

        // 添加ESC键关闭功能
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        document.body.appendChild(modal);
        searchInput.focus();
    };
    //继续存量游戏
    continueGame() {
        document.getElementById('historyInputModal').style.display = 'block';
    }



    // 更新加载进度条
    updateLoadingProgress(progress, stage = '') {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('loadingProgress');
        const stageText = document.getElementById('loadingStage');
        if (progress >= 0 && progress <= 100) {
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${progress}%`;
            if (stage) {
                stageText.textContent = stage;
            }
        } else if (progress === -1) {
            progressText.textContent = '加载中...';
            stageText.textContent = '';
        }
    }



    async initializeGame() {
        const wordLength = parseInt(document.getElementById('wordLength').value);
        if (wordLength < 3 || wordLength > 15) {
            alert('请输入3到15之间的单词长度');
            return;
        }

        // 显示加载动画
        const loadingElement = document.getElementById('loading');
        const gameAreaElement = document.getElementById('gameArea');
        loadingElement.classList.add('active');
        gameAreaElement.style.display = 'none';
        document.getElementById('gameStatus').className = 'game-status';
        document.getElementById('gameStatus').textContent = '';

        // 禁用开始按钮
        const startButton = document.querySelector('.setup-group button');
        startButton.disabled = true;
        startButton.textContent = '加载中...';

        // 重置进度条
        document.getElementById('progressBar').style.width = '0%';
        document.getElementById('loadingProgress').textContent = '0%';

        try {
            // 初始化求解器
            window.solver = this;
            this.wordLength = wordLength;
            this.onProgressUpdate = this.updateLoadingProgress; // 绑定进度更新函数
            await this.initializeWordList();

            // 更新统计信息
            document.getElementById('totalWords').textContent = this.allWords.length;
            document.getElementById('remainingWords').textContent = this.possibleWords.length;
            document.getElementById('guessCount').textContent = '0';

            // 获取第一个推荐词
            this.currentWord = await this.getBestGuess();
            
            // 隐藏加载动画并显示游戏区域
            loadingElement.classList.remove('active');
            gameAreaElement.style.display = 'block';
            document.getElementById('result').innerHTML = this.currentWord ? `建议猜测: ${this.currentWord.toUpperCase()}` : '没有找到合适的单词';
            document.getElementById('guessRecords').innerHTML = '';

            // 创建反馈网格
            this.createFeedbackGrid();

            // 更新可能的单词列表
            this.updatePossibleWordsList();
        } catch (error) {
            document.getElementById('gameStatus').className = 'game-status error';
            document.getElementById('gameStatus').textContent = error.message || '初始化游戏失败，请重试';
            document.getElementById('gameArea').style.display = 'none';
            console.error('游戏初始化失败:', error);
        } finally {
            // 恢复开始按钮状态
            startButton.disabled = false;
            startButton.textContent = '开始新游戏';
            // 移除加载动画
            loadingElement.classList.remove('active');
        }
    }

    //继续存量游戏-提交
    async processHistoryInput() {
        const historyText = document.getElementById('historyInput').value;
        const lines = historyText.trim().split('\n');

        // 收集所有错误信息
        const errors = [];

        // 验证输入是否为空
        if (lines.length === 0) {
            errors.push('请输入历史记录');
        }

        // 验证第一行格式并获取单词长度
        const firstLine = lines[0].trim();
        const firstLineParts = firstLine.split(' ');
        if (firstLineParts.length !== 2) {
            errors.push('输入格式错误，每行应为：单词 反馈');
        }

        const wordLength = firstLineParts[0].length;
        if (wordLength < 3 || wordLength > 15) {
            errors.push('单词长度必须在3到15之间');
        }

        // 验证所有行的格式
        const usedWords = new Map(); // 用于检查重复单词
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const [word, pattern] = line.split(' ');

            // 验证基本格式
            if (!word || !pattern) {
                errors.push(`第${i + 1}行格式错误，应为：单词 反馈`);
                continue;
            }

            // 验证单词长度
            if (word.length !== wordLength) {
                errors.push(`第${i + 1}行单词长度与第一行不一致`);
                continue;
            }

            // 验证单词格式
            if (!/^[a-zA-Z]+$/.test(word)) {
                errors.push(`第${i + 1}行单词包含非法字符`);
                continue;
            }

            // 验证反馈格式
            if (pattern.length !== wordLength || !/^[012]+$/.test(pattern)) {
                errors.push(`第${i + 1}行反馈格式错误，应为${wordLength}个数字（0、1或2）`);
                continue;
            }

            // 检查重复单词
            const lowerWord = word.toLowerCase();
            if (usedWords.has(lowerWord)) {
                const prevPattern = usedWords.get(lowerWord);
                if (prevPattern !== pattern) {
                    errors.push(`发现重复单词"${word}"，但反馈不一致`);
                }
                // 如果重复且反馈一致，跳过这一行
                continue;
            }
            usedWords.set(lowerWord, pattern);
        }

        // 如果有错误，显示所有错误并返回
        if (errors.length > 0) {
            alert(errors.join('\n'));
            return;
        }

        // 关闭弹框
        document.getElementById('historyInputModal').style.display = 'none';

        // 设置单词长度
        document.getElementById('wordLength').value = wordLength;

        // 初始化游戏
        await this.initializeGame();

        // 确保总单词数已更新
        document.getElementById('totalWords').textContent = this.allWords.length;
        document.getElementById('remainingWords').textContent = this.possibleWords.length;

        // 处理每一行历史记录（使用已验证的单词Map）
        for (const [word, pattern] of usedWords) {
            // 更新可能的单词列表
            this.updatePossibleWords(word, pattern);
            // 添加到猜测记录
            this.addGuessRecord(word, pattern);
        }

        // 获取新的推荐词
        this.currentWord = await this.getBestGuess();
        document.getElementById('result').innerHTML = this.currentWord ? `建议猜测: ${this.currentWord.toUpperCase()}` : '没有找到合适的单词';

        // 更新统计信息
        document.getElementById('remainingWords').textContent = this.possibleWords.length;
        document.getElementById('guessCount').textContent = usedWords.size;

        // 创建新的反馈网格
        this.createFeedbackGrid();

        // 更新可能的单词列表
        this.updatePossibleWordsList();


    }

    // 处理用户输入
    createFeedbackGrid() {
        const inputGroup = document.querySelector('.input-group');
        if (inputGroup) {
            inputGroup.classList.remove('submitted');
        }
        const feedbackGrid = document.getElementById('feedbackGrid');
        feedbackGrid.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${this.wordLength}, 40px)`;
        grid.style.gap = '5px';
        grid.style.margin = '20px 0';

        for (let i = 0; i < this.wordLength; i++) {
            const cell = document.createElement('div');
            cell.className = 'feedback-cell';
            cell.style.width = '40px';
            cell.style.height = '40px';
            cell.style.border = '2px solid #ccc';
            cell.style.borderRadius = '4px';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.fontWeight = 'bold';
            cell.style.fontSize = '1.2em';
            cell.style.cursor = 'pointer';
            cell.setAttribute('data-state', '0');
            cell.setAttribute('data-index', i);
            cell.textContent = this.currentWord[i].toUpperCase();

            cell.onclick = () => {
                this.selectCell(i);
                this.toggleCellState(cell);
            };

            grid.appendChild(cell);
        }

        feedbackGrid.appendChild(grid);
        this.selectCell(0);
    }

    selectCell(index) {
        document.querySelectorAll('.feedback-cell').forEach(cell => {
            cell.style.outline = 'none';
        });

        this.currentCellIndex = index;
        const cells = document.querySelectorAll('.feedback-cell');
        if (cells[index]) {
            cells[index].style.outline = '2px solid #2196F3';
            cells[index].style.outlineOffset = '2px';
        }
    }
    toggleCellState(cell) {
        const currentState = parseInt(cell.getAttribute('data-state'));
        const nextState = (currentState + 1) % 3;
        this.updateCellState(cell, nextState);
    }
    updateCellState(cell, state) {
        cell.setAttribute('data-state', state);
        const colors = ['#787c7e', '#c9b458', '#6aaa64'];
        cell.style.backgroundColor = colors[state];
        cell.style.color = 'white';
        cell.style.borderColor = colors[state];
    }
    async submitFeedback() {
        // 检查是否有当前单词
        if (!this.currentWord) {
            alert('当前没有可提交的反馈，请先开始游戏');
            return;
        }
        const submitButton = document.getElementById('submitFeedbackBtn');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 计算中...';
        submitButton.classList.add('loading');

        try {
            const cells = document.querySelectorAll('.feedback-cell');
            const pattern = Array.from(cells).map(cell => cell.getAttribute('data-state')).join('');

            // 更新可能的单词列表
            const updateSuccess = this.updatePossibleWords(this.currentWord, pattern);
            if (!updateSuccess) {
                document.getElementById('gameStatus').className = 'game-status error';
                document.getElementById('gameStatus').textContent = '输入的反馈与之前的猜测不一致，请检查';
                submitButton.disabled = false;
                submitButton.innerHTML = '提交反馈';
                submitButton.classList.remove('loading');
                return;
            }

            // 添加到猜测历史
            this.addGuessRecord(this.currentWord, pattern);
            
            // 重置topGuesses和currentGuessIndex，确保下次获取最新的建议
            this.topGuesses = null;
            this.currentGuessIndex = 0;

            await this.refreshGameArea();

            // 检查是否还有可能的单词
            if (this.possibleWords.length === 0) {
                document.getElementById('gameStatus').className = 'game-status error';
                document.getElementById('gameStatus').textContent = '没有找到符合条件的单词，请检查反馈是否正确';
            }
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = '提交反馈';
            submitButton.classList.remove('loading');
        }
    }


    //重置本次反馈
    resetFeedback() {
        // 检查是否有当前单词
        if (!this.currentWord) {
            alert('当前没有可重置的反馈，请先开始游戏');
            return;
        }
        document.querySelectorAll('.feedback-cell').forEach(cell => {
            cell.style.backgroundColor = 'white';
            cell.style.color = '#000';
            cell.style.borderColor = '#ccc';
            cell.setAttribute('data-state', '0');
        });
        this.selectCell(0);
    }

    //撤销上次反馈
    undoLastGuess() {
        const guessRecords = document.getElementById('guessRecords');
        const lastGuess = guessRecords.firstChild;
        if (!lastGuess) {
            alert('没有可撤销的记录');
            return;
        }
        // 移除最后一次猜测记录
        guessRecords.removeChild(lastGuess);

        // 更新统计信息
        document.getElementById('guessCount').textContent =
            document.querySelectorAll('.guess-item').length;

        // 恢复上一轮的熵缓存（如果有）
        if (this.entropyCacheHistory.length > 0) {
            this.entropyCache = this.entropyCacheHistory.pop();
            this.log('已恢复上一轮的熵缓存');
        }

        // 重新初始化可能的单词列表
        this.possibleWords = [...this.allWords];

        // 重新应用所有剩余的猜测记录
        Array.from(document.querySelectorAll('.guess-item')).reverse().forEach(record => {
            // 获取单词和模式，添加空值检查
            const patternCells = record.querySelectorAll('.pattern-cell');
            if (patternCells && patternCells.length > 0) {
                // 从pattern-cell元素中提取单词
                const word = Array.from(patternCells).map(cell => cell.textContent.toLowerCase()).join('');
                // 从pattern-cell的类名中提取模式
                const pattern = Array.from(patternCells)
                    .map(cell => cell.className.includes('pattern-2') ? '2' :
                        cell.className.includes('pattern-1') ? '1' : '0')
                    .join('');
                this.updatePossibleWords(word, pattern);
            }
        });

        // 更新界面
        document.getElementById('remainingWords').textContent = this.possibleWords.length;
        this.updatePossibleWordsList();

        // 重置当前建议词索引
        this.currentGuessIndex = 0;
        
        // 获取新的建议词
        this.getBestGuess().then(bestGuess => {
            this.currentWord = bestGuess;
            window.currentWord = bestGuess;
            document.getElementById('result').innerHTML = `建议猜测: ${bestGuess.toUpperCase()}`;
            this.createFeedbackGrid();
        });

        // 重置游戏状态
        document.getElementById('gameStatus').className = 'game-status';
        document.getElementById('gameStatus').textContent = '';
    }


    // 添加-猜测记录
    addGuessRecord(word, pattern) {
        const recordDiv = document.createElement('div');
        recordDiv.className = 'guess-item';

        const guessNumber = document.querySelectorAll('.guess-item').length + 1;
        const numberSpan = document.createElement('span');
        numberSpan.style.marginRight = '8px';
        numberSpan.textContent = `#${guessNumber}`;

        const patternDiv = document.createElement('div');
        patternDiv.className = 'guess-pattern';

        for (let i = 0; i < pattern.length; i++) {
            const cell = document.createElement('div');
            cell.className = `pattern-cell pattern-${pattern[i]}`;
            cell.textContent = word[i].toUpperCase();
            patternDiv.appendChild(cell);
        }

        recordDiv.appendChild(numberSpan);
        recordDiv.appendChild(patternDiv);

        const guessRecords = document.getElementById('guessRecords');
        guessRecords.insertBefore(recordDiv, guessRecords.firstChild);
    }







    // 换一个建议
    async switchSuggestion() {
        if (!this.possibleWords || this.possibleWords.length <= 1) {
            alert('当前没有其他可选的建议词');
            return;
        }

        // 根据可能词数量确定最大建议数，最多不超过8个
        const maxSuggestions = Math.min(8, this.possibleWords.length);

        // 如果还没有获取最优解列表或已经用完，重新获取
        if (!this.topGuesses || this.topGuesses.length === 0 || this.currentGuessIndex >= this.topGuesses.length) {
            // 从可能的单词中选择信息熵最大的前几位
            this.topGuesses = await this.getTopGuesses(maxSuggestions);
            this.currentGuessIndex = 0;
        }

        // 确保不重复选择同一个单词
        if (this.topGuesses.length > 1) {
            // 更新当前建议词
            this.currentWord = this.topGuesses[this.currentGuessIndex];
            window.currentWord = this.currentWord; // 更新全局变量
            document.getElementById('result').innerHTML = `建议猜测: ${this.currentWord.toUpperCase()}`;

            // 更新按钮文本
            const switchButton = document.querySelector('button[onclick="solver.switchSuggestion()"]');
            if (switchButton) {
                switchButton.textContent = `换一个建议 (${this.currentGuessIndex + 1}/${this.topGuesses.length})`;
            }

            this.createFeedbackGrid(); // 重新创建反馈网格

            // 更新索引，放在最后执行
            this.currentGuessIndex = (this.currentGuessIndex + 1) % this.topGuesses.length;
        } else {
            alert('当前只有一个可能的建议词');
        }
    }



    // 添加-可能的单词
    updatePossibleWordsList() {
        const wordList = document.getElementById('wordList');
        wordList.innerHTML = '';

        // 只显示前50个单词，避免过多
        const wordsToShow = this.possibleWords.slice(0, 50);
        wordsToShow.forEach(word => {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'word-item';
            wordSpan.textContent = word.toUpperCase();
            wordList.appendChild(wordSpan);
        });

        if (this.possibleWords.length > 50) {
            const moreWords = document.createElement('span');
            moreWords.className = 'word-item';
            moreWords.style.backgroundColor = '#f5f5f5';
            moreWords.textContent = `...还有 ${this.possibleWords.length - 50} 个`;
            wordList.appendChild(moreWords);
        }
    }


    // 刷新游戏区域的所有元素
    async refreshGameArea() {
        // 更新统计信息
        document.getElementById('totalWords').textContent = this.allWords ? this.allWords.length : '0';
        document.getElementById('remainingWords').textContent = this.possibleWords ? this.possibleWords.length : '0';
        document.getElementById('guessCount').textContent = document.querySelectorAll('.guess-item').length;

        // 获取下一个建议词
        if (this.possibleWords && this.possibleWords.length > 0) {
            const nextWord = await this.getBestGuess();
            this.currentWord = nextWord;
            window.currentWord = nextWord; // 确保全局变量同步更新
            
            // 重置建议按钮文本
            const switchButton = document.querySelector('button[onclick="solver.switchSuggestion()"]');
            if (switchButton) {
                switchButton.textContent = '换一个建议';
            }
            
            if (this.possibleWords.length === 1) {
                document.getElementById('result').innerHTML = `谜底: ${this.currentWord.toUpperCase()}`;
                document.getElementById('gameStatus').className = 'game-status success';
                document.getElementById('gameStatus').textContent = '恭喜你找到了谜底！';
            } else {
                document.getElementById('result').innerHTML = `建议猜测: ${this.currentWord.toUpperCase()}`;
                document.getElementById('gameStatus').className = 'game-status';
                document.getElementById('gameStatus').textContent = '';
            }
            this.createFeedbackGrid();
        } else if (this.possibleWords) {
            document.getElementById('gameStatus').className = 'game-status error';
            document.getElementById('gameStatus').textContent = '没有找到符合条件的单词';
            document.getElementById('result').innerHTML = '没有可能的单词';
        } else {
            document.getElementById('result').textContent = '请选择单词长度并开始游戏';
        }

        // 更新可能的单词列表
        this.updatePossibleWordsList();
    }







    // 初始化单词列表
    async initializeWordList() {
    this.log(`debug模式已开启`)
    // 尝试从localStorage加载缓存
    const cacheKey = `wordlist_${this.wordLength}`;
    const cacheVersion = '1.0';
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        try {
            this.updateProgress(0, '正在加载缓存...');
            const cache = JSON.parse(cachedData);
            if (!cache.version || cache.version !== cacheVersion || !Array.isArray(cache.words) || cache.words.length === 0) {
                throw new Error('缓存数据无效或版本不匹配');
            }
            this.updateProgress(30, '正在验证缓存...');
            // 验证缓存的单词格式
            if (!cache.words.every(word => typeof word === 'string' && word.length === this.wordLength && /^[a-z]+$/.test(word))) {
                throw new Error('缓存数据格式错误');
            }
            this.allWords = cache.words;
            this.possibleWords = [...cache.words];
            this.updateProgress(80, '正在初始化单词列表...');
            // this.updateProgress(100, '加载完成');
            return;
        } catch (error) {
            console.error('缓存数据解析失败:', error);
            this.updateProgress(0, '准备下载单词列表...');
            // 清除无效的缓存
            localStorage.removeItem(cacheKey);
        }
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            // 从CDN加载单词列表
            this.updateProgress(0, '正在连接服务器...');
            const response = await fetch('https://cdn.jsdelivr.net/gh/dwyl/english-words/words_alpha.txt');
            if (!response.ok) throw new Error(`单词列表加载失败: ${response.status} ${response.statusText}`);

            // 使用 Response.body 和 ReadableStream 来监控下载进度
            const reader = response.body.getReader();
            // const contentLength = +response.headers.get('Content-Length');
            const contentLength = 4234910
            let receivedLength = 0;
            let chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                // 将value数组的每个元素分别添加到chunks中
                value.forEach(byte => chunks.push(byte));
                receivedLength += value.length;
                // 计算下载进度（0-60%）
                const downloadProgress = Math.floor((receivedLength / contentLength) * 60);
                this.updateProgress(downloadProgress, `正在下载单词列表...${Math.floor((receivedLength / contentLength) * 100)}%`);
            }

            // 解码内容（60-70%）
            this.updateProgress(60, '正在解码文件内容...');
            const content = new TextDecoder().decode(new Uint8Array(chunks.flat()));
            if (!content) throw new Error('下载内容为空');

            // 验证内容格式
            if (!/^[\x20-\x7E\n\r]*$/.test(content)) {
                throw new Error('下载内容包含无效字符');
            }
            this.log(`文件下载完成，总长度: ${content.length} 字符`);
            this.updateProgress(70, '文件处理中...');

            // 分割和过滤单词 (80-90%)
            this.updateProgress(80, '正在处理单词...');
            const lines = content.split(/\r?\n/);
            const totalLines = lines.length;
            let processedLines = 0;
            let words = [];

            // 分批处理单词以避免界面卡顿
            const batchSize = 1000;
            for (let i = 0; i < lines.length; i += batchSize) {
                const batch = lines.slice(i, i + batchSize);
                const batchWords = batch
                    .map(w => w.trim().toLowerCase())
                    .filter(word => {
                        // 增强的单词验证
                        if (!word) return false;
                        if (word.length !== this.wordLength) return false;
                        if (!/^[a-z]+$/.test(word)) return false;
                        return true;
                    });
                words.push(...batchWords);

                processedLines += batch.length;
                const processingProgress = 70 + Math.floor((processedLines / totalLines) * 20);
                this.updateProgress(processingProgress, `正在处理单词...${Math.floor((processedLines / totalLines) * 100)}%`);

                // 让出主线程，避免界面卡顿
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            // 验证处理结果
            if (words.length === 0) {
                throw new Error('未找到符合长度要求的有效单词');
            }

            // 保存结果 (90-95%)
            this.updateProgress(90, '正在初始化单词列表...');
            this.allWords = words;
            this.possibleWords = [...words];

            // 缓存到localStorage (95-100%)
            this.updateProgress(95, '正在保存缓存...');
            try {
                const cacheData = {
                    version: cacheVersion,
                    words: words
                };
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (error) {
                console.error('缓存保存失败:', error);
            }

            this.updateProgress(100, '加载完成');
            return;
        } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
                throw new Error('单词列表加载失败: ' + error.message);
            }
            this.updateProgress(0, `连接失败，正在重试(${retryCount}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // 指数退避
        }
    }
}

}
