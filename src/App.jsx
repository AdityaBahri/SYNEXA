import React, { useState, useEffect, useRef } from 'react';
import { Activity, ShieldAlert, Wifi, WifiOff, UploadCloud, Stethoscope, User, ActivitySquare } from 'lucide-react';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [pressure, setPressure] = useState(0); // in N
  const [aiDose, setAiDose] = useState("0.0"); // in ml
  const isAlert = pressure > 100;
  const wsRef = useRef(null);
  
  // Auto-Sensing State
  const [isParameterSent, setIsParameterSent] = useState(false);
  const [holdTimer, setHoldTimer] = useState(0);

  
  const [formData, setFormData] = useState({
    nama: '',
    usia: '',
    beratBadan: '',
    jenisKelamin: 'Laki-laki',
    riwayatDental: '',
    riwayatMedis: '',
    jenisAnestesi: 'Lidocaine 2%'
  });

  const [espIp, setEspIp] = useState('192.168.4.1');
  const [logMessages, setLogMessages] = useState([]);

  const addLog = (msg) => {
    setLogMessages(prev => [...prev.slice(-9), msg]); // Keep last 10 logs for better scenario view
  };

  // Connect to ESP32 WebSocket
  const connectWebSocket = () => {
    if (wsRef.current) wsRef.current.close();
    
    try {
      addLog(`Connecting to ws://${espIp}:81...`);
      wsRef.current = new WebSocket(`ws://${espIp}:81`);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        addLog("Connected to ESP32.");
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.pressure !== undefined) {
            setPressure(data.pressure);
          }
          if (data.doseRecommendation !== undefined) {
            setAiDose(data.doseRecommendation);
          }
          if (data.message) {
            addLog(`SYS: ${data.message}`);
          }
        } catch (e) {
          console.error("Parse error", e);
        }
      };
      
      wsRef.current.onclose = () => {
        setIsConnected(false);
        addLog("Disconnected.");
      };
      
      wsRef.current.onerror = () => {
        setIsConnected(false);
        addLog("WebSocket Error.");
      };
    } catch (e) {
      addLog("Failed to initiate WebSocket.");
    }
  };

  // Simulation Scenario State
  const [simState, setSimState] = useState('idle'); 

  const startScenario = () => {
    if (!isParameterSent) {
      setFormData({
         nama: 'Budi (Pasien Simulasi)',
         usia: '30',
         beratBadan: '65',
         jenisKelamin: 'Laki-laki',
         riwayatDental: 'Gigi 46, Karies Profunda',
         riwayatMedis: 'Tidak ada alergi',
         jenisAnestesi: 'Lidocaine 2%'
      });
      addLog("[SIMULATOR] Data pasien diisi otomatis! Klik 'Kalkulasi AI' lalu klik tombol ini lagi.");
      return;
    }
    setSimState('holding');
    setPressure(2.5); // simulate holding
    addLog("---------- SIMULASI DIMULAI ----------");
    addLog("[TAHAP 1] Operator memegang tang di gigi pasien (Tekanan masuk ~2.5 N)");
  };

  useEffect(() => {
    let interval;
    if (simState === 'extracting') {
      addLog("[TAHAP 3] Operator memulai menarik gigi (Proses Ekstraksi Berjalan)...");
      let tempPressure = 2.5;
      interval = setInterval(() => {
        tempPressure += Math.random() * 8 + 4; // ramp up pressure randomly
        setPressure(tempPressure);
        
        if (tempPressure >= 102) {
          clearInterval(interval);
          addLog("⚠️ [TAHAP 3] Peringatan Gaya Berlebih (Limit)! Operator mengurangi tekanan.");
          setTimeout(() => {
             setPressure(0);
             setSimState('idle');
             addLog("✅ [SELESAI] Gigi berhasil diekstraksi tanpa mematahkan tulang alveolar.");
             addLog("--------------------------------------");
          }, 3500);
        }
      }, 600);
    }
    return () => clearInterval(interval);
  }, [simState]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSendParams = (e) => {
    e.preventDefault();
    const payload = {
      command: "SET_PARAMS",
      data: formData
    };
    
    // AI Dose Calculation based on dataset
    const usia = parseFloat(formData.usia);
    const bb = parseFloat(formData.beratBadan);
    const medisLC = formData.riwayatMedis.toLowerCase();
    const dentalLC = formData.riwayatDental.toLowerCase();
    const hasMedis = (medisLC && medisLC.indexOf('aman') === -1 && medisLC.indexOf('tidak') === -1) ? 1 : 0;
    const hasDental = (dentalLC && (dentalLC.indexOf('karies') !== -1 || dentalLC.indexOf('sakit') !== -1 || dentalLC.indexOf('radang') !== -1)) ? 1 : 0;
    
    let calculatedDose = "0.00";
    if (hasMedis) {
       // Restricted limit due to systemic condition
       calculatedDose = bb >= 65 ? "1.50*" : "1.40*";
    } else if (usia <= 15 || bb <= 40) {
       calculatedDose = "1.20"; // Child dose
    } else if (hasDental) {
       // Higher dose for infected/carious tissue
       calculatedDose = (bb * 0.048).toFixed(2); 
    } else {
       // Standard dose
       calculatedDose = (bb * 0.027).toFixed(2);
    }
    setAiDose(calculatedDose);

    if (isConnected && wsRef.current) {
      payload.calculatedDose = calculatedDose;
      wsRef.current.send(JSON.stringify(payload));
      addLog("Parameters sent to ESP32.");
    } else {
      addLog(`[AI] Analisis Selesai. Rekomendasi Dosis: ${calculatedDose} ml`);
    }
    
    setIsParameterSent(true);
    setHoldTimer(0);
  };

  const handleExecute = (isAuto = false) => {
    const triggerMsg = isAuto ? "Auto-Sensing Trigger" : "Manual Trigger";
    if (isConnected && wsRef.current) {
      wsRef.current.send(JSON.stringify({ command: "EXECUTE_ANESTHESIA", dose: aiDose, trigger: triggerMsg }));
      addLog(`[${triggerMsg}] Executing injection: ${aiDose}ml`);
    } else {
      addLog(`[TAHAP 2] Injeksi Anestesi ${aiDose}ml (Micro-Pump beroperasi otomatis)`);
      if (simState === 'holding' && isAuto) {
         setSimState('injecting');
         setTimeout(() => {
            setSimState('extracting');
         }, 3000); // 3 seconds after injection, start extraction
      }
    }
    // Reset after execution
    if (isAuto) setIsParameterSent(false);
  };

  // Auto-sensing effect
  useEffect(() => {
    let interval;
    if (isParameterSent && pressure > 0.5 && pressure < 5.0) {
      interval = setInterval(() => {
        setHoldTimer(prev => {
          const next = prev + 0.1;
          if (next >= 5.0) {
            handleExecute(true);
            return 5.0;
          }
          return next;
        });
      }, 100);
    } else {
      setHoldTimer(0);
    }
    return () => clearInterval(interval);
  }, [pressure, isParameterSent]);

  return (
    <>
      <header className="header">
        <div className="brand">
          <ActivitySquare size={28} color="#00e5ff" />
          <h1>SYNEXA AI</h1>
        </div>
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></div>
          <span style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
            {isConnected ? `Connected (${espIp})` : 'Disconnected'}
          </span>
          <button 
            onClick={isConnected ? () => wsRef.current.close() : connectWebSocket} 
            className="btn" 
            style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', marginLeft: '1rem', background: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', width: 'auto' }}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </header>

      <main className="dashboard-container">
        {/* Left Panel: Monitoring */}
        <section className="glass-panel">
          <h2 className="card-title">
            <Activity size={20} color="#3b82f6" /> 
            Real-time Telemetry
          </h2>
          
          <div className="gauge-container">
            <div className={`gauge ${isAlert ? 'danger' : ''}`} style={{ '--rotation': `${(pressure / 150) * 360}deg` }}>
              <div style={{ textAlign: 'center', zIndex: 2 }}>
                <div className="gauge-value" style={{ color: isAlert ? 'var(--danger)' : 'var(--text-main)' }}>
                  {pressure.toFixed(1)}
                </div>
                <div className="gauge-unit">N Force</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '1rem', padding: '0 10px' }}>
              <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>0 (Min)</span>
              <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 600 }}>100 (Limit)</span>
            </div>
          </div>

          {isAlert && (
            <div className="alert-box">
              <ShieldAlert size={24} color="#ef4444" style={{ flexShrink: 0 }} />
              <div>
                <strong>CRITICAL WARNING!</strong>
                <div style={{ fontSize: '0.85rem', marginTop: '4px', opacity: 0.9 }}>
                   Gaya ekstraksi melebihi batas aman tulang alveolar (&gt;100 N). Kurangi tekanan segera.
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '2rem' }}>
             <button onClick={startScenario} className="btn" style={{ background: 'rgba(0,229,255,0.1)', color: '#00b8d4', border: '1px solid #00b8d4' }}>
               Jalankan Skenario Demonstrasi
             </button>
             <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem', textAlign: 'center' }}>
               (Simulasi: Input -&gt; Auto-Sensing 5dtk -&gt; Ekstraksi)
             </p>
          </div>
        </section>

        {/* Center Panel: Form Input */}
        <section className="glass-panel">
          <h2 className="card-title">
            <User size={20} color="#00e5ff" /> 
            Profil Klinis Pasien (Data AI)
          </h2>
          
          <form onSubmit={handleSendParams}>
            <div className="form-group">
              <label>Nama Pasien</label>
              <input type="text" name="nama" value={formData.nama} onChange={handleChange} placeholder="Masukkan nama..." required />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Usia (Tahun)</label>
                <input type="number" name="usia" value={formData.usia} onChange={handleChange} placeholder="Mis: 25" required />
              </div>
              <div className="form-group">
                <label>Berat Badan (kg)</label>
                <input type="number" name="beratBadan" value={formData.beratBadan} onChange={handleChange} placeholder="Mis: 65" required />
              </div>
              <div className="form-group">
                <label>Jenis Kelamin</label>
                <select name="jenisKelamin" value={formData.jenisKelamin} onChange={handleChange}>
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Riwayat Dental (Lokasi & Kondisi Jaringan)</label>
              <textarea name="riwayatDental" value={formData.riwayatDental} onChange={handleChange} rows="2" placeholder="Mis: Gigi 46, karies profunda, jaringan periodontal normal..."></textarea>
            </div>

            <div className="form-group">
              <label>Riwayat Medis (Alergi/Sistemik)</label>
              <textarea name="riwayatMedis" value={formData.riwayatMedis} onChange={handleChange} rows="2" placeholder="Mis: Tidak ada alergi, tidak ada riwayat hipertensi..."></textarea>
            </div>

            <div className="form-group">
              <label>Pemilihan Cairan Anestesi</label>
              <select name="jenisAnestesi" value={formData.jenisAnestesi} onChange={handleChange}>
                <option value="Lidocaine 2%">Lidocaine 2% (dengan Adrenalin 1:100.000)</option>
                <option value="Articaine 4%">Articaine 4% (dengan Adrenalin 1:100.000)</option>
                <option value="Mepivacaine 3%">Mepivacaine 3% (Plain)</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              <UploadCloud size={18} />
              Kalkulasi AI & Kirim ke Mikrokontroler
            </button>
          </form>
        </section>

        {/* Right Panel: Controls & Logs */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="card-title">
            <Stethoscope size={20} color="#10b981" />
            AI Decision Output
          </h2>
          
          <div style={{ background: 'rgba(0,0,0,0.03)', padding: '1.5rem', borderRadius: '12px', textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Rekomendasi Dosis Anestesi</div>
            <div style={{ fontSize: '3.5rem', fontWeight: 700, color: '#00b8d4', lineHeight: 1, textShadow: '0 0 20px rgba(0,184,212,0.2)' }}>
              {aiDose} <span style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>ml</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '1rem' }}>
              ✓ Status: Siap Diinjeksikan (Micro-Pump Ready)
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className={`status-indicator ${isParameterSent ? 'connected' : 'disconnected'}`}></div>
              Auto-Sensing Trigger
            </div>
            
            {!isParameterSent ? (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Mohon kirim parameter klinis terlebih dahulu.</div>
            ) : (
              <>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '8px' }}>
                  Tahan instrumen (tekanan 0.5 - 5.0 N) selama 5 detik untuk injeksi otomatis.
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(holdTimer / 5.0) * 100}%`, height: '100%', background: '#00e5ff', transition: 'width 0.1s linear' }}></div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#00e5ff', marginTop: '4px', textAlign: 'right' }}>
                  {holdTimer.toFixed(1)}s / 5.0s
                </div>
              </>
            )}
          </div>

          <button onClick={() => handleExecute(false)} className="btn" style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-main)', border: '1px solid rgba(0,0,0,0.1)' }}>
             Manual Override (Bypass AI)
          </button>

          <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
             <div className="form-group" style={{ marginBottom: '1rem' }}>
               <label>ESP32 IP Address</label>
               <input type="text" value={espIp} onChange={(e) => setEspIp(e.target.value)} placeholder="192.168.4.1" />
             </div>
             
             <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: '8px', padding: '1rem', minHeight: '120px', fontFamily: 'monospace', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
               <div style={{ color: '#00b8d4', marginBottom: '4px' }}>--- System Logs ---</div>
               {logMessages.length === 0 && <div style={{ color: 'rgba(0,0,0,0.3)' }}>Menunggu aktivitas...</div>}
               {logMessages.map((msg, i) => (
                 <div key={i} style={{ color: 'var(--text-main)', opacity: 0.8 }}>{msg}</div>
               ))}
             </div>
          </div>
        </section>
      </main>
    </>
  );
}

export default App;
