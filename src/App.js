import React, { useState, useEffect } from 'react';
import "./App.css";
import apiService from './apiService';

const LoginPage = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !mobile) {
      setError('All fields are required');
      return;
    }

    // if (!email.endsWith('@thapar.edu')) {
    //   setError('Email must end with @thapar.edu');
    //   return;
    // }

    setLoading(true);
    try {
      const response = await apiService.register(name, email, mobile);
      localStorage.setItem('participantId', response.id);
      localStorage.setItem('participantName', response.name);
      localStorage.setItem('participantEmail', response.email);
      onLogin(response);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' height={50} alt="logo" />
        </div>
      </div>
      
      <div className="login-card">
        <h1 className="page-title">Perfect CV Match 2025</h1>
        <h2 className="section-title">Register / Login</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <div>
          <div className="form-group">
            <label>Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Enter your full name"
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="email"
            />
          </div>
          
          <div className="form-group">
            <label>Mobile Number</label>
            <input 
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="input-field"
              placeholder="+91 XXXXX XXXXX"
            />
          </div>
          
          <button 
            type="button" 
            onClick={handleSubmit} 
            className="login-button"
            disabled={loading}
          >
            {loading ? 'REGISTERING...' : 'REGISTER / LOGIN'}
          </button>
        </div>
      </div>
    </div>
  );
};

const HomePage = ({ onNavigate, onLogout }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadCount, setUploadCount] = useState(0);
  const [scoreResult, setScoreResult] = useState(null);

  useEffect(() => {
    loadUploadCount();
  }, []);

  const loadUploadCount = async () => {
    try {
      const participantId = localStorage.getItem('participantId');
      const data = await apiService.getUploadCount(participantId);
      setUploadCount(data.upload_count);
    } catch (err) {
      console.error('Failed to load upload count:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.pdf')) {
        setError('Only PDF files are allowed');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError('File size must be less than 20MB');
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.endsWith('.pdf')) {
        setError('Only PDF files are allowed');
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError('File size must be less than 20MB');
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    setScoreResult(null);

    if (!selectedFile) {
      setError('Please select a PDF file');
      return;
    }

    if (!jobDescription || jobDescription.length < 50) {
      setError('Job description must be at least 50 characters');
      return;
    }

    if (uploadCount >= 5) {
      setError('You have reached the maximum upload limit (5)');
      return;
    }

    setLoading(true);
    try {
      const participantId = localStorage.getItem('participantId');
      const result = await apiService.submitResume(participantId, selectedFile, jobDescription);
      
      setSuccess(`Submission successful! Your score: ${result.score}% - ${result.verdict}`);
      setScoreResult(result);
      setSelectedFile(null);
      setJobDescription('');
      await loadUploadCount();
    } catch (err) {
      setError(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' alt='logo' height={60}></img>
        </div>
        <button className="logout-button" onClick={onLogout}>⊗</button>
      </div>

      <div className="home-content-new">
        <div className="center-title">
          <h1 className="main-title">Perfect CV</h1>
          <p>Welcome, {localStorage.getItem('participantName')} | Uploads: {uploadCount}/5</p>
        </div>
        
        <div className="sidebar">
          <button className="nav-button active">HOME</button>
          <button className="nav-button" onClick={() => onNavigate('leaderboard')}>Leaderboard</button>
          <button className="nav-button" onClick={() => onNavigate('scores')}>My Scores</button>
        </div>

        <div className="upload-card">
          <label className="file-label">Upload Resume (PDF only)</label>
          
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          
          <div 
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput').click()}
          >
            <div className="upload-icon">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="28" stroke="#ccc" strokeWidth="2" strokeDasharray="4 4"/>
                <path d="M30 20 L30 40 M20 30 L40 30" stroke="#999" strokeWidth="2"/>
              </svg>
            </div>
            <p className="upload-text">
              {selectedFile ? selectedFile.name : 'Hold & Pull files to Upload'}
            </p>
            <input 
              id="fileInput"
              type="file" 
              onChange={handleFileChange}
              accept=".pdf"
            />
          </div>

          <input 
            type="text" 
            placeholder="Job Description (min 50 chars)" 
            className="link-input"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
          
          <button 
            className="submit-button" 
            onClick={handleSubmit}
            disabled={loading || uploadCount >= 5}
          >
            {loading ? 'Submitting...' : 'Submit CV'}
          </button>

          {scoreResult && (
            <div className="score-result">
              <h3>Score: {scoreResult.score}%</h3>
              <p>Verdict: {scoreResult.verdict}</p>
              <p>Skills: {scoreResult.skills.join(', ')}</p>
              <p>Experience: {scoreResult.experience_years} years</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MyScoresPage = ({ onNavigate, onLogout }) => {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bestScore, setBestScore] = useState(null);

  useEffect(() => {
    loadScores();
  }, []);

  const loadScores = async () => {
    try {
      const participantId = localStorage.getItem('participantId');
      const data = await apiService.getParticipantScores(participantId);
      setScores(data.scores);
      setBestScore(data.best_score);
    } catch (err) {
      console.error('Failed to load scores:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' alt='logo' height={60}></img>
        </div>
        <button className="logout-button" onClick={onLogout}>⊗</button>
      </div>

      <div className="leaderboard-content">
        <div className="leaderboard-header">
          <button className="back-button" onClick={() => onNavigate('home')}>← Back to Home</button>
          <h1 className="leaderboard-title">My Scores</h1>
        </div>

        {bestScore && (
          <div className="best-score">
            <h2>Best Score: {bestScore}%</h2>
          </div>
        )}

        {loading ? (
          <p>Loading scores...</p>
        ) : scores.length === 0 ? (
          <p>No submissions yet. Upload your resume to get started!</p>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Score</th>
                <th>Skills</th>
                <th>Experience</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score, index) => (
                <tr key={score.id || index}>
                  <td>{index + 1}</td>
                  <td>{score.score}%</td>
                  <td>{score.skills_count}</td>
                  <td>{score.experience_years} yrs</td>
                  <td>{new Date(score.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const LeaderboardPage = ({ onNavigate, onLogout }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const data = await apiService.getLeaderboard();
      setLeaderboardData(data.leaderboard);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const getMedalEmoji = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  return (
    <div className="page-container">
      <div className="header">
        <div className="logo">
          <img src='/mlsc.png' alt='logo' height={60}></img>
        </div>
        <button className="logout-button" onClick={onLogout}>⊗</button>
      </div>

      <div className="leaderboard-content">
        <div className="leaderboard-header">
          <button className="back-button" onClick={() => onNavigate('home')}>← Back to Home</button>
          <h1 className="leaderboard-title">Leaderboard</h1>
        </div>

        {loading ? (
          <p>Loading leaderboard...</p>
        ) : leaderboardData.length === 0 ? (
          <p>No submissions yet. Be the first to compete!</p>
        ) : (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Email</th>
                <th>Score</th>
                <th>Skills</th>
                <th>Experience</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardData.map((entry) => (
                <tr key={entry.rank}>
                  <td>{entry.rank} {getMedalEmoji(entry.rank)}</td>
                  <td>{entry.email}</td>
                  <td>{entry.score}%</td>
                  <td>{entry.skills_count}</td>
                  <td>{entry.experience} yrs</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [currentPage, setCurrentPage] = useState('login');
  const [participantData, setParticipantData] = useState(null);

  useEffect(() => {
    // Check if user is already logged in
    const participantId = localStorage.getItem('participantId');
    if (participantId) {
      setCurrentPage('home');
    }
  }, []);

  const handleLogin = (data) => {
    setParticipantData(data);
    setCurrentPage('home');
  };

  const handleLogout = () => {
    localStorage.clear();
    setParticipantData(null);
    setCurrentPage('login');
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="app">
      {currentPage === 'login' && <LoginPage onLogin={handleLogin} />}
      {currentPage === 'home' && <HomePage onNavigate={handleNavigate} onLogout={handleLogout} />}
      {currentPage === 'scores' && <MyScoresPage onNavigate={handleNavigate} onLogout={handleLogout} />}
      {currentPage === 'leaderboard' && <LeaderboardPage onNavigate={handleNavigate} onLogout={handleLogout} />}
    </div>
  );
};

export default App;