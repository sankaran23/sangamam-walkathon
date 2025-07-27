// src/App.js - Part 1: Imports, State Management & Initialization
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  User, FileText, Clock, CheckCircle, Users, Calendar, MapPin, 
  Download, Search, RefreshCw, Heart, CreditCard, Upload, Database,
  QrCode, Camera, X
} from 'lucide-react';
import emailjs from 'emailjs-com';
import { loadStripe } from '@stripe/stripe-js';

// Initialize Supabase (fallback to null if not configured)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Initialize Stripe (fallback to null if not configured)
const stripePromise = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY ? 
  loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY) : null;

const SangamamApp = () => {
  // Main navigation state
  const [currentView, setCurrentView] = useState('home');
  
  // Data states
  const [registeredParticipants, setRegisteredParticipants] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState('');
  
  // Loading and sync states
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  
  // Registration form data (CORRECTED - no tshirtSize)
  const [registrationData, setRegistrationData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    emergencyContact: '',
    emergencyPhone: '',
    additionalParty: ''
  });
  
  // Waiver and signature states
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [signature, setSignature] = useState('');
  
  // UI and interaction states
  const [searchTerm, setSearchTerm] = useState('');
  const [donationAmount, setDonationAmount] = useState('');
  const [checkedInParticipants, setCheckedInParticipants] = useState(new Set());
  const [checkedOutParticipants, setCheckedOutParticipants] = useState(new Set());
  
  // QR Scanner states
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrScanResult, setQrScanResult] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);

  // Google Sheets CSV URL - UPDATE THIS WITH YOUR SHEET ID
  const GOOGLE_SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1ijOVIsCHmFG5D0MIUvHM33EhuRTxEEYKj4wsTQSdLeg';

  // Initialize app data on component mount
  useEffect(() => {
    initializeData();
  }, []);

  // Cleanup camera when component unmounts or scanner closes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const initializeData = async () => {
    await loadParticipants();
    await fetchGoogleSheetsData();
    loadLocalData();
  };

  const loadLocalData = () => {
    try {
      const savedCheckedIn = JSON.parse(localStorage.getItem('sangamam-checked-in') || '[]');
      const savedCheckedOut = JSON.parse(localStorage.getItem('sangamam-checked-out') || '[]');
      const savedSyncTime = localStorage.getItem('sangamam-last-sync');
      
      setCheckedInParticipants(new Set(savedCheckedIn));
      setCheckedOutParticipants(new Set(savedCheckedOut));
      setLastSyncTime(savedSyncTime);
    } catch (error) {
      console.error('Error loading local data:', error);
    }
  };

  const loadParticipants = async () => {
    if (!supabase) {
      // Fallback to localStorage if Supabase not configured
      const saved = JSON.parse(localStorage.getItem('sangamam-participants') || '[]');
      setParticipants(saved);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setParticipants(data || []);
    } catch (error) {
      console.error('Error loading participants:', error);
      // Fallback to localStorage
      const saved = JSON.parse(localStorage.getItem('sangamam-participants') || '[]');
      setParticipants(saved);
    }
  };



// src/App.js - Part 2: Data Fetching & QR Scanner Functions

  const fetchGoogleSheetsData = async () => {
    setIsLoading(true);
    try {
      // Try to fetch from Google Sheets
      const response = await fetch(GOOGLE_SHEETS_CSV_URL);
      const csvData = await response.text();
      
      if (csvData && csvData.length > 50) { // Basic validation
        const parsedData = parseCSV(csvData);
        setRegisteredParticipants(parsedData);
        const syncTime = new Date().toLocaleString();
        setLastSyncTime(syncTime);
        localStorage.setItem('sangamam-last-sync', syncTime);
        localStorage.setItem('sangamam-google-sheets-data', JSON.stringify(parsedData));
      } else {
        throw new Error('Invalid CSV data');
      }
    } catch (error) {
      console.error('Error fetching Google Sheets:', error);
      
      // Try to load cached data
      const cachedData = localStorage.getItem('sangamam-google-sheets-data');
      if (cachedData) {
        setRegisteredParticipants(JSON.parse(cachedData));
      } else {
        // Fallback sample data for demo
        const sampleData = [
          {
            id: 'gs_1',
            firstName: 'Ramesh',
            lastName: 'Patel',
            email: 'ramesh.patel@email.com',
            phone: '(408) 555-0123',
            source: 'google_sheets'
          },
          {
            id: 'gs_2',
            firstName: 'Priya',
            lastName: 'Sharma',
            email: 'priya.sharma@email.com',
            phone: '(408) 987-6543',
            source: 'google_sheets'
          },
          {
            id: 'gs_3',
            firstName: 'Kumar',
            lastName: 'Krishnan',
            email: 'kumar.krishnan@email.com',
            phone: '(408) 456-7890',
            source: 'google_sheets'
          }
        ];
        setRegisteredParticipants(sampleData);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length >= headers.length && values.some(v => v.length > 0)) {
        const participant = {
          id: `gs_${i}`,
          source: 'google_sheets'
        };
        
        headers.forEach((header, index) => {
          const key = mapHeaderToKey(header);
          participant[key] = values[index] || '';
        });
        
        // Ensure required fields exist
        if (participant.firstName && participant.lastName) {
          data.push(participant);
        }
      }
    }
    
    return data;
  };

  const mapHeaderToKey = (header) => {
    const mapping = {
      'first name': 'firstName',
      'firstname': 'firstName',
      'last name': 'lastName',
      'lastname': 'lastName',
      'email': 'email',
      'email address': 'email',
      'phone': 'phone',
      'phone number': 'phone',
      'mobile': 'phone'
    };
    return mapping[header.toLowerCase()] || header.replace(/\s+/g, '');
  };

  // QR SCANNER FUNCTIONS
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsScanning(true);
        scanQRCode();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please ensure camera permissions are granted.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  const scanQRCode = () => {
    if (!isScanning || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        // Simple QR code detection - in production, use a proper QR library
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        // This is a simplified implementation - you might want to use libraries like:
        // - qr-scanner
        // - jsqr
        // - qrcode-reader
        
        // For now, we'll simulate QR detection
        // In real implementation, process imageData for QR codes
        
      } catch (error) {
        console.error('Error scanning QR code:', error);
      }
    }

    // Continue scanning
    if (isScanning) {
      requestAnimationFrame(scanQRCode);
    }
  };

  const handleQRScanSuccess = (result) => {
    setQrScanResult(result);
    stopCamera();
    setShowQRScanner(false);
    
    // Process the QR result - could be a participant ID, email, or URL
    if (result.includes('@')) {
      // Email detected - search for participant
      const participant = [...registeredParticipants, ...participants].find(p => 
        p.email.toLowerCase() === result.toLowerCase()
      );
      if (participant) {
        alert(`Participant found: ${participant.firstName} ${participant.lastName}`);
        // Auto-navigate to check-in or registration
        setCurrentView('checkin');
      } else {
        alert(`Email ${result} not found in registration list.`);
      }
    } else if (result.includes('http')) {
      // URL detected - could navigate to specific page
      alert(`QR Code detected: ${result}`);
    } else {
      alert(`QR Code scanned: ${result}`);
    }
  };

  const openQRScanner = () => {
    setShowQRScanner(true);
    setQrScanResult('');
    setTimeout(() => {
      startCamera();
    }, 100);
  };

  const closeQRScanner = () => {
    stopCamera();
    setShowQRScanner(false);
    setQrScanResult('');
  };



// src/App.js - Part 3: Form Handlers & Business Logic

  const handleRegistration = async () => {
    if (!waiverSigned) {
      alert('Please sign the waiver before completing registration.');
      return;
    }

    if (!registrationData.firstName || !registrationData.lastName || !registrationData.email || !registrationData.phone) {
      alert('Please fill in all required fields.');
      return;
    }

    const newParticipant = {
      id: Date.now(),
      ...registrationData,
      waiver_signed: true,
      signature,
      registration_time: new Date().toISOString(),
      checked_in: false,
      checked_out: false,
      source: selectedParticipant === 'new' ? 'on_site_registration' : 'pre_registered_confirmed'
    };

    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('participants')
          .insert([newParticipant])
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          newParticipant.id = data[0].id;
        }
      } else {
        // Fallback to localStorage
        const saved = JSON.parse(localStorage.getItem('sangamam-participants') || '[]');
        saved.push(newParticipant);
        localStorage.setItem('sangamam-participants', JSON.stringify(saved));
      }

      // Update local state
      setParticipants(prev => [...prev, newParticipant]);

      // Send confirmation email
      await sendConfirmationEmail(registrationData);

      alert('SANGAMAM registration completed successfully! 🎉\n\nYou will receive a confirmation email shortly.\n\nFREE breakfast and lunch included!');
      resetForm();
      setCurrentView('home');
      
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration saved locally! Note: Email confirmation may not be available.');
      resetForm();
      setCurrentView('home');
    }
  };

  const sendConfirmationEmail = async (participant) => {
    if (!process.env.REACT_APP_EMAILJS_SERVICE_ID) {
      console.log('Email service not configured');
      return;
    }

    try {
      await emailjs.send(
        process.env.REACT_APP_EMAILJS_SERVICE_ID,
        process.env.REACT_APP_EMAILJS_TEMPLATE_ID,
        {
          to_email: participant.email,
          to_name: `${participant.firstName} ${participant.lastName}`,
          event_name: 'SANGAMAM Community Walkathon',
          event_date: 'Saturday, August 16, 2025',
          event_time: '7:30 AM - NOON',
          event_location: 'Harvey Bear Ranch, San Martin',
          additional_party: participant.additionalParty || 'None',
          emergency_contact: participant.emergencyContact || 'Not provided',
          emergency_phone: participant.emergencyPhone || 'Not provided',
          // Add meal information
          breakfast_info: 'FREE breakfast at 8:15 AM before departure',
          lunch_info: 'FREE lunch at 12:00 PM after return to VVGC'
        },
        process.env.REACT_APP_EMAILJS_PUBLIC_KEY
      );
      console.log('Confirmation email sent successfully');
    } catch (error) {
      console.error('Email send error:', error);
    }
  };

  const handleDonation = async () => {
    const amount = parseFloat(donationAmount);
    if (!amount || amount < 1) {
      alert('Please enter a valid donation amount ($1 minimum)');
      return;
    }

    if (!stripePromise) {
      alert(`Thank you for your interest in donating $${amount}!\n\nPayment processing is not yet configured. Please contact the organizers for donation options:\n\nRamesh Veluriganesh: (408) 829-3865\nAnu C.K.: (408) 368-7230`);
      return;
    }

    try {
      // In a real implementation, you would:
      // 1. Call your backend to create a payment intent
      // 2. Redirect to Stripe checkout or use Stripe Elements
      // 3. Handle the payment confirmation
      
      alert(`Thank you for your generous donation of $${amount}!\n\nPayment processing will be implemented with backend integration.\n\nFor now, please contact organizers for donation options.`);
      setDonationAmount('');
    } catch (error) {
      console.error('Donation error:', error);
      alert('Donation processing error. Please try again or contact organizers.');
    }
  };

  const handleCheckIn = (participantId) => {
    const updated = new Set(checkedInParticipants);
    updated.add(participantId);
    setCheckedInParticipants(updated);
    localStorage.setItem('sangamam-checked-in', JSON.stringify([...updated]));
    
    // Update participant record if using Supabase
    if (supabase) {
      supabase
        .from('participants')
        .update({ 
          checked_in: true, 
          check_in_time: new Date().toISOString() 
        })
        .eq('id', participantId)
        .then(({ error }) => {
          if (error) console.error('Check-in update error:', error);
        });
    }
  };

  const handleCheckOut = (participantId) => {
    const updated = new Set(checkedOutParticipants);
    updated.add(participantId);
    setCheckedOutParticipants(updated);
    localStorage.setItem('sangamam-checked-out', JSON.stringify([...updated]));
    
    // Update participant record if using Supabase
    if (supabase) {
      supabase
        .from('participants')
        .update({ 
          checked_out: true, 
          check_out_time: new Date().toISOString() 
        })
        .eq('id', participantId)
        .then(({ error }) => {
          if (error) console.error('Check-out update error:', error);
        });
    }
  };

  const resetForm = () => {
    setRegistrationData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      emergencyContact: '',
      emergencyPhone: '',
      additionalParty: ''
    });
    setWaiverSigned(false);
    setSignature('');
    setSelectedParticipant('');
    setSearchTerm('');
  };

  const handleParticipantSelect = (participantId) => {
    const selected = registeredParticipants.find(p => p.id === participantId);
    if (selected) {
      setSelectedParticipant(participantId);
      setRegistrationData({
        firstName: selected.firstName || '',
        lastName: selected.lastName || '',
        email: selected.email || '',
        phone: selected.phone || '',
        emergencyContact: '',
        emergencyPhone: '',
        additionalParty: ''
      });
    } else if (participantId === 'new') {
      setSelectedParticipant('new');
      resetForm();
    }
  };

  const filteredParticipants = registeredParticipants.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.phone && p.phone.includes(searchTerm))
  );

  const exportData = () => {
    const data = {
      participants,
      registeredParticipants,
      checkedIn: [...checkedInParticipants],
      checkedOut: [...checkedOutParticipants],
      exportDate: new Date().toISOString(),
      totalRegistered: participants.length,
      totalPreRegistered: registeredParticipants.length,
      totalCheckedIn: checkedInParticipants.size,
      totalCompleted: checkedOutParticipants.size
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sangamam-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const allParticipants = [...registeredParticipants, ...participants];
    const headers = ['Name', 'Email', 'Phone', 'Emergency Contact', 'Emergency Phone', 'Additional Party', 'Source', 'Status', 'Registration Time'];
    const csvContent = [
      headers.join(','),
      ...allParticipants.map(p => [
        `"${p.firstName} ${p.lastName}"`,
        `"${p.email || ''}"`,
        `"${p.phone || ''}"`,
        `"${p.emergencyContact || ''}"`,
        `"${p.emergencyPhone || ''}"`,
        `"${p.additionalParty || ''}"`,
        `"${p.source || 'unknown'}"`,
        `"${checkedOutParticipants.has(p.id) ? 'Completed' : checkedInParticipants.has(p.id) ? 'Checked In' : 'Registered'}"`,
        `"${p.registration_time || p.registrationTime || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sangamam-participants-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };



// src/App.js - Part 3: Form Handlers & Business Logic

  const handleRegistration = async () => {
    if (!waiverSigned) {
      alert('Please sign the waiver before completing registration.');
      return;
    }

    if (!registrationData.firstName || !registrationData.lastName || !registrationData.email || !registrationData.phone) {
      alert('Please fill in all required fields.');
      return;
    }

    const newParticipant = {
      id: Date.now(),
      ...registrationData,
      waiver_signed: true,
      signature,
      registration_time: new Date().toISOString(),
      checked_in: false,
      checked_out: false,
      source: selectedParticipant === 'new' ? 'on_site_registration' : 'pre_registered_confirmed'
    };

    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('participants')
          .insert([newParticipant])
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          newParticipant.id = data[0].id;
        }
      } else {
        // Fallback to localStorage
        const saved = JSON.parse(localStorage.getItem('sangamam-participants') || '[]');
        saved.push(newParticipant);
        localStorage.setItem('sangamam-participants', JSON.stringify(saved));
      }

      // Update local state
      setParticipants(prev => [...prev, newParticipant]);

      // Send confirmation email
      await sendConfirmationEmail(registrationData);

      alert('SANGAMAM registration completed successfully! 🎉\n\nYou will receive a confirmation email shortly.\n\nFREE breakfast and lunch included!');
      resetForm();
      setCurrentView('home');
      
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration saved locally! Note: Email confirmation may not be available.');
      resetForm();
      setCurrentView('home');
    }
  };

  const sendConfirmationEmail = async (participant) => {
    if (!process.env.REACT_APP_EMAILJS_SERVICE_ID) {
      console.log('Email service not configured');
      return;
    }

    try {
      await emailjs.send(
        process.env.REACT_APP_EMAILJS_SERVICE_ID,
        process.env.REACT_APP_EMAILJS_TEMPLATE_ID,
        {
          to_email: participant.email,
          to_name: `${participant.firstName} ${participant.lastName}`,
          event_name: 'SANGAMAM Community Walkathon',
          event_date: 'Saturday, August 16, 2025',
          event_time: '7:30 AM - NOON',
          event_location: 'Harvey Bear Ranch, San Martin',
          additional_party: participant.additionalParty || 'None',
          emergency_contact: participant.emergencyContact || 'Not provided',
          emergency_phone: participant.emergencyPhone || 'Not provided',
          // Add meal information
          breakfast_info: 'FREE breakfast at 8:15 AM before departure',
          lunch_info: 'FREE lunch at 12:00 PM after return to VVGC'
        },
        process.env.REACT_APP_EMAILJS_PUBLIC_KEY
      );
      console.log('Confirmation email sent successfully');
    } catch (error) {
      console.error('Email send error:', error);
    }
  };

  const handleDonation = async () => {
    const amount = parseFloat(donationAmount);
    if (!amount || amount < 1) {
      alert('Please enter a valid donation amount ($1 minimum)');
      return;
    }

    if (!stripePromise) {
      alert(`Thank you for your interest in donating $${amount}!\n\nPayment processing is not yet configured. Please contact the organizers for donation options:\n\nRamesh Veluriganesh: (408) 829-3865\nAnu C.K.: (408) 368-7230`);
      return;
    }

    try {
      // In a real implementation, you would:
      // 1. Call your backend to create a payment intent
      // 2. Redirect to Stripe checkout or use Stripe Elements
      // 3. Handle the payment confirmation
      
      alert(`Thank you for your generous donation of $${amount}!\n\nPayment processing will be implemented with backend integration.\n\nFor now, please contact organizers for donation options.`);
      setDonationAmount('');
    } catch (error) {
      console.error('Donation error:', error);
      alert('Donation processing error. Please try again or contact organizers.');
    }
  };

  const handleCheckIn = (participantId) => {
    const updated = new Set(checkedInParticipants);
    updated.add(participantId);
    setCheckedInParticipants(updated);
    localStorage.setItem('sangamam-checked-in', JSON.stringify([...updated]));
    
    // Update participant record if using Supabase
    if (supabase) {
      supabase
        .from('participants')
        .update({ 
          checked_in: true, 
          check_in_time: new Date().toISOString() 
        })
        .eq('id', participantId)
        .then(({ error }) => {
          if (error) console.error('Check-in update error:', error);
        });
    }
  };

  const handleCheckOut = (participantId) => {
    const updated = new Set(checkedOutParticipants);
    updated.add(participantId);
    setCheckedOutParticipants(updated);
    localStorage.setItem('sangamam-checked-out', JSON.stringify([...updated]));
    
    // Update participant record if using Supabase
    if (supabase) {
      supabase
        .from('participants')
        .update({ 
          checked_out: true, 
          check_out_time: new Date().toISOString() 
        })
        .eq('id', participantId)
        .then(({ error }) => {
          if (error) console.error('Check-out update error:', error);
        });
    }
  };

  const resetForm = () => {
    setRegistrationData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      emergencyContact: '',
      emergencyPhone: '',
      additionalParty: ''
    });
    setWaiverSigned(false);
    setSignature('');
    setSelectedParticipant('');
    setSearchTerm('');
  };

  const handleParticipantSelect = (participantId) => {
    const selected = registeredParticipants.find(p => p.id === participantId);
    if (selected) {
      setSelectedParticipant(participantId);
      setRegistrationData({
        firstName: selected.firstName || '',
        lastName: selected.lastName || '',
        email: selected.email || '',
        phone: selected.phone || '',
        emergencyContact: '',
        emergencyPhone: '',
        additionalParty: ''
      });
    } else if (participantId === 'new') {
      setSelectedParticipant('new');
      resetForm();
    }
  };

  const filteredParticipants = registeredParticipants.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.phone && p.phone.includes(searchTerm))
  );

  const exportData = () => {
    const data = {
      participants,
      registeredParticipants,
      checkedIn: [...checkedInParticipants],
      checkedOut: [...checkedOutParticipants],
      exportDate: new Date().toISOString(),
      totalRegistered: participants.length,
      totalPreRegistered: registeredParticipants.length,
      totalCheckedIn: checkedInParticipants.size,
      totalCompleted: checkedOutParticipants.size
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sangamam-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const allParticipants = [...registeredParticipants, ...participants];
    const headers = ['Name', 'Email', 'Phone', 'Emergency Contact', 'Emergency Phone', 'Additional Party', 'Source', 'Status', 'Registration Time'];
    const csvContent = [
      headers.join(','),
      ...allParticipants.map(p => [
        `"${p.firstName} ${p.lastName}"`,
        `"${p.email || ''}"`,
        `"${p.phone || ''}"`,
        `"${p.emergencyContact || ''}"`,
        `"${p.emergencyPhone || ''}"`,
        `"${p.additionalParty || ''}"`,
        `"${p.source || 'unknown'}"`,
        `"${checkedOutParticipants.has(p.id) ? 'Completed' : checkedInParticipants.has(p.id) ? 'Checked In' : 'Registered'}"`,
        `"${p.registration_time || p.registrationTime || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sangamam-participants-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


// src/App.js - Part 5: Home View Component

  // HOME VIEW COMPONENT
  const HomeView = () => (
    <div className="min-h-screen bg-gradient-to-br from-sky-400 to-blue-800">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="bg-white text-sky-500 px-4 py-2 rounded-lg font-bold inline-block mb-4 text-sm">
            VVGC PRESENTS
          </div>
          <h1 className="text-5xl font-bold text-yellow-400 mb-2 drop-shadow-lg">SANGAMAM</h1>
          <p className="text-xl text-yellow-300 mb-4 italic">OUR FIRST-EVER COMMUNITY HIKE AND WALK EVENT</p>
          <p className="text-2xl text-white mb-6 max-w-2xl mx-auto">
            Join us for a refreshing morning walk to support a healthier community.
          </p>
          
          <div className="bg-white bg-opacity-10 rounded-xl p-6 max-w-md mx-auto mb-8 border-2 border-yellow-400">
            <div className="text-yellow-400 text-sm font-bold mb-2">SPECIAL GUEST</div>
            <div className="text-2xl font-bold text-white mb-2">MARK TURNER</div>
            <div className="text-gray-200">MAYOR OF MORGAN HILL</div>
          </div>
          
          <div className="flex items-center justify-center gap-6 flex-wrap text-white mb-8">
            <div className="flex items-center gap-2 bg-white bg-opacity-10 px-4 py-2 rounded-lg">
              <Calendar className="w-5 h-5" />
              <span><span className="text-yellow-400 font-bold">Saturday,</span> August 16</span>
            </div>
            <div className="flex items-center gap-2 bg-white bg-opacity-10 px-4 py-2 rounded-lg">
              <Clock className="w-5 h-5" />
              <span><span className="text-yellow-400 font-bold">Time:</span> 7:30AM - NOON</span>
            </div>
            <div className="flex items-center gap-2 bg-white bg-opacity-10 px-4 py-2 rounded-lg">
              <MapPin className="w-5 h-5" />
              <span><span className="text-yellow-400 font-bold">Where:</span> Harvey Bear Ranch</span>
            </div>
          </div>

          {/* FREE Meals Highlight */}
          <div className="bg-yellow-400 text-blue-900 rounded-xl p-4 max-w-lg mx-auto mb-8 font-bold">
            <div className="text-lg">🍳 FREE BREAKFAST & 🍽️ FREE LUNCH</div>
            <div className="text-sm">All meals included for registered participants!</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-6 max-w-6xl mx-auto mb-8">
          <button
            onClick={() => setCurrentView('register')}
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-all border-l-4 border-green-500 hover:scale-105"
          >
            <User className="w-12 h-12 text-green-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Register</h3>
            <p className="text-gray-600 text-sm">Sign up for SANGAMAM</p>
          </button>

          <button
            onClick={() => setCurrentView('waiver')}
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-all border-l-4 border-blue-500 hover:scale-105"
          >
            <FileText className="w-12 h-12 text-blue-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Waiver</h3>
            <p className="text-gray-600 text-sm">Digital waiver form</p>
          </button>

          <button
            onClick={() => setCurrentView('checkin')}
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-all border-l-4 border-purple-500 hover:scale-105"
          >
            <CheckCircle className="w-12 h-12 text-purple-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Check In</h3>
            <p className="text-gray-600 text-sm">Event day check-in</p>
          </button>

          <button
            onClick={openQRScanner}
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-all border-l-4 border-indigo-500 hover:scale-105"
          >
            <QrCode className="w-12 h-12 text-indigo-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">QR Scan</h3>
            <p className="text-gray-600 text-sm">Scan participant codes</p>
          </button>

          <button
            onClick={() => setCurrentView('donation')}
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-all border-l-4 border-red-500 hover:scale-105"
          >
            <Heart className="w-12 h-12 text-red-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Donate</h3>
            <p className="text-gray-600 text-sm">Support our cause</p>
          </button>

          <button
            onClick={() => setCurrentView('admin')}
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-all border-l-4 border-orange-500 hover:scale-105"
          >
            <Users className="w-12 h-12 text-orange-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Admin</h3>
            <p className="text-gray-600 text-sm">Manage event</p>
          </button>
        </div>

        <div className="bg-white bg-opacity-95 rounded-lg shadow-md p-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Live Event Statistics</h3>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchGoogleSheetsData}
                disabled={isLoading}
                className="flex items-center gap-2 text-sm bg-sky-500 text-white px-3 py-1 rounded-md hover:bg-sky-600 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Sync
              </button>
              {lastSyncTime && (
                <span className="text-xs text-gray-500">Last sync: {lastSyncTime}</span>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-sky-600">{registeredParticipants.length}</div>
              <div className="text-sm text-gray-600">Pre-Registered</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{participants.length}</div>
              <div className="text-sm text-gray-600">App Registrations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{checkedInParticipants.size}</div>
              <div className="text-sm text-gray-600">Checked In</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{checkedOutParticipants.size}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );




// src/App.js - Part 6: Registration View Component

  // REGISTRATION VIEW COMPONENT
  const RegistrationView = () => (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-sky-500">
            <div>
              <h2 className="text-2xl font-bold text-sky-600">SANGAMAM Registration</h2>
              <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold inline-block mt-2">
                Google Sheets Integration
              </div>
            </div>
            <button
              onClick={() => setCurrentView('home')}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </div>

          {/* Data Source Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-800">Data Sources</span>
              </div>
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 text-sm bg-green-500 text-white px-3 py-1 rounded-md hover:bg-green-600"
              >
                <Download className="w-3 h-3" />
                Export CSV
              </button>
            </div>
            <div className="text-sm text-blue-700">
              <div>📊 Google Sheets: {registeredParticipants.length} pre-registered participants</div>
              <div>💾 App Database: {participants.length} confirmed registrations</div>
            </div>
          </div>

          {/* Participant Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Participant
            </label>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                className="w-full pl-10 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <select
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              value={selectedParticipant}
              onChange={(e) => handleParticipantSelect(e.target.value)}
            >
              <option value="">-- Select participant --</option>
              <optgroup label="📊 Pre-Registered (Google Sheets)">
                {filteredParticipants.map(participant => (
                  <option key={participant.id} value={participant.id}>
                    {participant.firstName} {participant.lastName} - {participant.email}
                  </option>
                ))}
              </optgroup>
              <option value="new">➕ New Walk-In Registration</option>
            </select>
            
            {selectedParticipant && selectedParticipant !== 'new' && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="text-sm text-green-800">
                  ✓ Participant data loaded from Google Sheets
                </div>
              </div>
            )}
          </div>

          {/* Event Information - UPDATED with FREE meals */}
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-lg p-5 mb-6">
            <h3 className="font-bold text-lg mb-3 text-yellow-300">Event Schedule - FREE Meals Included!</h3>
            <div className="text-sm space-y-1">
              <div>7:30 AM - Gathering and parking at VVGC campus, San Martin</div>
              <div>8:00 AM - Registration and stretching session</div>
              <div className="font-bold text-yellow-300">8:15 AM - 🍳 FREE BREAKFAST provided</div>
              <div>8:30 AM - Bus transportation to Harvey Bear Ranch</div>
              <div>9:00 AM - 11:00 AM - Hiking/walking activity</div>
              <div>11:30 AM - Return bus transportation</div>
              <div className="font-bold text-yellow-300">12:00 PM - 🍽️ FREE LUNCH service at VVGC Campus</div>
            </div>
          </div>

          {/* Registration Form - SIMPLIFIED (no T-shirt) */}
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                <input
                  type="text"
                  required
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  value={registrationData.firstName}
                  onChange={(e) => setRegistrationData({...registrationData, firstName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                <input
                  type="text"
                  required
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  value={registrationData.lastName}
                  onChange={(e) => setRegistrationData({...registrationData, lastName: e.target.value})}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  required
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  value={registrationData.email}
                  onChange={(e) => setRegistrationData({...registrationData, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
                <input
                  type="tel"
                  required
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  value={registrationData.phone}
                  onChange={(e) => setRegistrationData({...registrationData, phone: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Participants in My Party
              </label>
              <input
                type="text"
                placeholder="List other participants you're registering for"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                value={registrationData.additionalParty}
                onChange={(e) => setRegistrationData({...registrationData, additionalParty: e.target.value})}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact</label>
                <input
                  type="text"
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  value={registrationData.emergencyContact}
                  onChange={(e) => setRegistrationData({...registrationData, emergencyContact: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Phone</label>
                <input
                  type="tel"
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  value={registrationData.emergencyPhone}
                  onChange={(e) => setRegistrationData({...registrationData, emergencyPhone: e.target.value})}
                />
              </div>
            </div>

            {/* FREE Meals Info - UPDATED */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                🍽️ FREE Meals Included
              </div>
              <div className="text-green-700 text-sm">
                <p><strong>Breakfast:</strong> Light refreshments before departure (8:15 AM)</p>
                <p><strong>Lunch:</strong> Full meal service after return (12:00 PM)</p>
                <p className="font-medium mt-2">All meals are complimentary for registered participants!</p>
              </div>
            </div>

            {/* Transportation Info - UPDATED */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-800 font-medium mb-2">
                🚌 FREE Transportation & Meals
              </div>
              <div className="text-blue-700 text-sm">
                <p><strong>Transportation:</strong> Round-trip bus service from VVGC Campus to Harvey Bear Ranch</p>
                <p><strong>Meals:</strong> Complimentary breakfast (8:15 AM) and lunch (12:00 PM)</p>
                <p><strong>Schedule:</strong> Arrive by 7:30 AM for check-in and breakfast</p>
                <p className="font-medium mt-2">Everything is FREE for registered participants!</p>
              </div>
            </div>

            {/* Waiver Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex items-center mb-2">
                <FileText className="w-5 h-5 text-yellow-600 mr-2" />
                <span className="font-medium text-yellow-800">Liability Waiver Required</span>
              </div>
              <p className="text-sm text-yellow-700 mb-3">
                All participants must sign a digital liability waiver before completing registration.
              </p>
              <button
                type="button"
                onClick={() => setCurrentView('waiver')}
                className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 transition-colors text-sm"
              >
                {waiverSigned ? '✓ Waiver Signed' : 'Sign Waiver'}
              </button>
            </div>

            <button
              onClick={handleRegistration}
              disabled={!waiverSigned}
              className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
                waiverSigned
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Complete SANGAMAM Registration
            </button>
          </div>
        </div>
      </div>
    </div>
  );


// src/App.js - Part 7: Waiver View Component

  // WAIVER VIEW COMPONENT
  const WaiverView = () => (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-sky-600">SANGAMAM Liability Waiver & Release</h2>
            <button onClick={() => setCurrentView('register')} className="text-gray-500 hover:text-gray-700">← Back</button>
          </div>
          
          <div className="text-center mb-6 p-4 bg-sky-50 border border-sky-200 rounded-lg">
            <h3 className="text-xl font-bold text-sky-700 mb-2">SANGAMAM COMMUNITY WALKATHON</h3>
            <h4 className="text-lg font-semibold text-gray-700 mb-3">LIABILITY WAIVER AND RELEASE OF CLAIMS</h4>
            <div className="text-sm text-gray-600 grid md:grid-cols-2 gap-2">
              <p><strong>Event:</strong> SANGAMAM - First-Ever Community Hike</p>
              <p><strong>Date:</strong> Saturday, August 16, 2025</p>
              <p><strong>Location:</strong> Harvey Bear Ranch, San Martin, CA</p>
              <p><strong>Organizer:</strong> VVGC</p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg mb-6 max-h-96 overflow-y-auto border">
            <div className="prose prose-sm">
              <h4 className="font-semibold mb-3 text-gray-800">PARTICIPANT INFORMATION</h4>
              <div className="grid md:grid-cols-2 gap-4 mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
                <div>
                  <strong>Full Name:</strong> {registrationData.firstName} {registrationData.lastName}
                </div>
                <div>
                  <strong>Email:</strong> {registrationData.email}
                </div>
                <div>
                  <strong>Phone:</strong> {registrationData.phone}
                </div>
                <div>
                  <strong>Emergency Contact:</strong> {registrationData.emergencyContact}
                </div>
              </div>

              <h4 className="font-semibold mb-3 text-gray-800">ACKNOWLEDGMENT OF RISKS</h4>
              <p className="mb-4 text-gray-700">
                I/We, the undersigned participant(s), acknowledge and understand that participation in the SANGAMAM Community Walkathon involves inherent risks and dangers that may result in serious personal injury, property damage, or death. These risks include, but are not limited to:
              </p>
              <ul className="list-disc ml-6 mb-4 text-gray-700">
                <li><strong>Terrain and Environmental Hazards:</strong> Uneven ground, rocks, holes, wildlife encounters, weather conditions, and natural obstacles</li>
                <li><strong>Physical Exertion:</strong> Cardiovascular stress, dehydration, heat exhaustion, and physical strain</li>
                <li><strong>Transportation Risks:</strong> Risks associated with bus transportation to and from the event location</li>
                <li><strong>Facility and Equipment Hazards:</strong> Conditions of trails, rest areas, and event facilities</li>
                <li><strong>Actions of Others:</strong> Conduct of other participants, volunteers, spectators, event staff, or third parties</li>
              </ul>
              
              <h4 className="font-semibold mb-3 text-gray-800">ASSUMPTION OF RISK</h4>
              <p className="mb-4 text-gray-700">
                I/We voluntarily assume full responsibility for all risks associated with participation in this event, whether such risks are known or unknown, foreseen or unforeseen. I/We understand that no one is forcing me/us to participate, and I/we choose to do so despite the risks involved.
              </p>

              <h4 className="font-semibold mb-3 text-gray-800">RELEASE AND WAIVER OF LIABILITY</h4>
              <p className="mb-4 text-gray-700">
                In consideration for being permitted to participate in the SANGAMAM Community Walkathon, I/We hereby <strong>RELEASE, WAIVE, AND DISCHARGE</strong> VVGC, its officers, directors, employees, volunteers, agents, and any affiliated organizations from any and all liability, claims, demands, actions, or causes of action arising out of or related to any loss, damage, or injury that may be sustained by me/us during participation in this event.
              </p>

              <h4 className="font-semibold mb-3 text-gray-800">SANTA CLARA COUNTY INDEMNIFICATION</h4>
              <p className="mb-4 text-gray-700">
                The Participants shall indemnify, defend, and hold harmless the County of Santa Clara, its officers, agents, and employees from any claim, liability, loss, or damage arising out of, or in connection with this event. It is the intent of the parties that the broadest possible coverage be provided to the County.
              </p>

              <h4 className="font-semibold mb-3 text-gray-800">MEDICAL TREATMENT AUTHORIZATION</h4>
              <p className="mb-4 text-gray-700">
                I/We authorize event organizers and their designated representatives to secure emergency medical treatment for me/us if deemed necessary and understand that I/we am/are responsible for all costs associated with medical treatment.
              </p>

              <h4 className="font-semibold mb-3 text-gray-800">PHOTOGRAPHY AND MEDIA RELEASE</h4>
              <p className="mb-4 text-gray-700">
                I/We grant permission to VVGC and its representatives to photograph, videotape, or otherwise record my/our participation in this event and to use such recordings for promotional, educational, or marketing purposes without compensation.
              </p>

              <p className="text-sm text-gray-600 italic">
                By signing below, I/We acknowledge that I/We have carefully read and fully understand this waiver and release, understand that this agreement affects my/our legal rights, and am/are signing this agreement voluntarily. This waiver shall be governed by the laws of the State of California.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Digital Signature (Type your full legal name) *
              </label>
              <input
                type="text"
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="Type your full legal name here"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="agree"
                className="h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300 rounded"
                checked={waiverSigned}
                onChange={(e) => setWaiverSigned(e.target.checked)}
              />
              <label htmlFor="agree" className="ml-2 text-sm text-gray-700">
                I have read, understood, and agree to the terms of this waiver and release form for the SANGAMAM hiking activity. I understand that this agreement is binding upon my heirs, assigns, and legal representatives.
              </label>
            </div>

            <button
              onClick={() => {
                if (signature && waiverSigned) {
                  alert('SANGAMAM waiver signed successfully!');
                  setCurrentView('register');
                } else {
                  alert('Please provide your signature and check the agreement box.');
                }
              }}
              disabled={!signature || !waiverSigned}
              className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
                signature && waiverSigned
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Sign SANGAMAM Waiver & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );



// src/App.js - Part 8: Check-in and Donation Views

  // CHECK-IN VIEW COMPONENT
  const CheckInView = () => (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white p-5 rounded-lg mb-6 text-center relative">
            <button 
              onClick={() => setCurrentView('home')} 
              className="absolute top-4 right-4 text-white hover:text-gray-200 bg-white bg-opacity-20 px-3 py-1 rounded"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold mb-2">SANGAMAM Check-In</h2>
            <p className="text-yellow-300">Saturday, August 16 • Harvey Bear Ranch Hike</p>
            
            {/* QR Scanner button for quick check-in */}
            <button
              onClick={openQRScanner}
              className="mt-4 bg-white bg-opacity-20 text-white px-4 py-2 rounded-md hover:bg-opacity-30 transition-colors flex items-center gap-2 mx-auto"
            >
              <QrCode className="w-4 h-4" />
              Quick QR Check-In
            </button>
          </div>

          <div className="grid gap-4">
            {[...registeredParticipants, ...participants].length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>No participants registered yet.</p>
                <p className="text-sm">Participants will appear here once they register.</p>
              </div>
            ) : (
              [...registeredParticipants, ...participants]
                .filter(p => p.firstName && p.lastName) // Filter out incomplete records
                .map((participant) => (
                <div key={participant.id} className="border rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                  <div>
                    <h3 className="font-semibold text-gray-800">{participant.firstName} {participant.lastName}</h3>
                    <p className="text-sm text-gray-600">{participant.email}</p>
                    <p className="text-sm text-gray-600">{participant.phone}</p>
                    <div className="flex gap-2 mt-2">
                      {participant.source === 'google_sheets' && (
                        <span className="text-xs bg-sky-100 text-sky-800 px-2 py-1 rounded">📊 Pre-Registered</span>
                      )}
                      {participant.source?.includes('on_site') && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">🆕 Walk-in</span>
                      )}
                      {checkedInParticipants.has(participant.id) && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">✓ Checked In</span>
                      )}
                      {checkedOutParticipants.has(participant.id) && (
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">✓ Completed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!checkedInParticipants.has(participant.id) ? (
                      <button 
                        onClick={() => handleCheckIn(participant.id)} 
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm"
                      >
                        Check In
                      </button>
                    ) : !checkedOutParticipants.has(participant.id) ? (
                      <button 
                        onClick={() => handleCheckOut(participant.id)} 
                        className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors text-sm"
                      >
                        Complete Hike
                      </button>
                    ) : (
                      <span className="text-green-600 font-medium text-sm">✅ Complete</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <div className="text-blue-800 font-bold mb-2">🚌 Transportation Schedule</div>
            <div className="text-blue-700 text-sm">
              <p><strong>🍳 Breakfast:</strong> 8:15 AM at VVGC Campus (FREE)</p>
              <p><strong>🚌 Departure:</strong> 8:30 AM from VVGC Campus</p>
              <p><strong>🥾 Hiking:</strong> 9:00 AM - 11:00 AM at Harvey Bear Ranch</p>
              <p><strong>🚌 Return:</strong> 11:30 AM from Harvey Bear Ranch</p>
              <p><strong>🍽️ Lunch:</strong> 12:00 PM at VVGC Campus (FREE)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // DONATION VIEW COMPONENT
  const DonationView = () => (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-red-500">
            <div>
              <h2 className="text-2xl font-bold text-red-600">Support SANGAMAM</h2>
              <p className="text-gray-600">Help us build a healthier community</p>
            </div>
            <button
              onClick={() => setCurrentView('home')}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </div>

          <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-8 h-8 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Make a Difference</h3>
                <p className="text-gray-600">Your donation helps fund community health initiatives</p>
              </div>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Support future community events and activities</li>
              <li>• Fund health and wellness programs</li>
              <li>• Provide resources for underserved families</li>
              <li>• Maintain community spaces and trails</li>
              <li>• Sponsor youth programs and activities</li>
              <li>• Support VVGC community initiatives</li>
            </ul>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Donation Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-500">$</span>
                <input
                  type="number"
                  min="1"
                  className="w-full pl-8 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Enter amount"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {['25', '50', '100', '250'].map(amount => (
                <button
                  key={amount}
                  onClick={() => setDonationAmount(amount)}
                  className={`p-3 border rounded-md transition-colors text-center ${
                    donationAmount === amount 
                      ? 'border-red-500 bg-red-50 text-red-700' 
                      : 'border-gray-300 hover:border-red-500 hover:bg-red-50'
                  }`}
                >
                  ${amount}
                </button>
              ))}
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Payment Processing</span>
              </div>
              <p className="text-xs text-gray-600">
                Secure payment processing via Stripe. A small processing fee (2.9% + $0.30) will be deducted from your donation to cover transaction costs. VVGC is a registered non-profit organization.
              </p>
            </div>

            <button
              onClick={handleDonation}
              disabled={!donationAmount || parseFloat(donationAmount) < 1}
              className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
                donationAmount && parseFloat(donationAmount) >= 1
                  ? 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {donationAmount ? `Donate $${donationAmount}` : 'Enter Donation Amount'}
            </button>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                VVGC is a registered non-profit organization. Donations may be tax-deductible. 
                Contact your tax advisor for specific guidance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );



// src/App.js - Part 9: Admin View and Main App Render

  // ADMIN VIEW COMPONENT
  const AdminView = () => (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">SANGAMAM Admin Panel</h2>
            <button
              onClick={() => setCurrentView('home')}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </div>

          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-6 text-center">
              <div className="text-3xl font-bold text-sky-600">{registeredParticipants.length}</div>
              <div className="text-sky-800">Pre-Registered</div>
              <div className="text-xs text-sky-600 mt-1">From Google Sheets</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <div className="text-3xl font-bold text-green-600">{participants.length}</div>
              <div className="text-green-800">App Registrations</div>
              <div className="text-xs text-green-600 mt-1">Via this app</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 text-center">
              <div className="text-3xl font-bold text-purple-600">{checkedInParticipants.size}</div>
              <div className="text-purple-800">Checked In</div>
              <div className="text-xs text-purple-600 mt-1">Event day attendance</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 text-center">
              <div className="text-3xl font-bold text-orange-600">{checkedOutParticipants.size}</div>
              <div className="text-orange-800">Completed</div>
              <div className="text-xs text-orange-600 mt-1">Finished the hike</div>
            </div>
          </div>

          <div className="flex gap-4 mb-6 flex-wrap">
            <button
              onClick={exportData}
              className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={fetchGoogleSheetsData}
              disabled={isLoading}
              className="flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-md hover:bg-sky-600 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Sync Google Sheets
            </button>
            <button
              onClick={openQRScanner}
              className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-md hover:bg-indigo-600"
            >
              <QrCode className="w-4 h-4" />
              QR Scanner
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-left">Name</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Email</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Phone</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Emergency Contact</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Source</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Waiver</th>
                </tr>
              </thead>
              <tbody>
                {[...registeredParticipants, ...participants]
                  .filter(p => p.firstName && p.lastName)
                  .map((participant) => (
                  <tr key={participant.id}>
                    <td className="border border-gray-300 px-4 py-2">
                      {participant.firstName} {participant.lastName}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">{participant.email}</td>
                    <td className="border border-gray-300 px-4 py-2">{participant.phone}</td>
                    <td className="border border-gray-300 px-4 py-2">{participant.emergencyContact || 'Not provided'}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        participant.source === 'google_sheets' 
                          ? 'bg-sky-100 text-sky-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {participant.source === 'google_sheets' ? '📊 Pre-Reg' : '🆕 App-Reg'}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {checkedOutParticipants.has(participant.id) ? (
                        <span className="text-purple-600 font-medium">✅ Completed</span>
                      ) : checkedInParticipants.has(participant.id) ? (
                        <span className="text-blue-600 font-medium">🎯 Checked In</span>
                      ) : (
                        <span className="text-gray-600">📋 Registered</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {participant.waiver_signed || participant.waiverSigned ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-red-600">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {[...registeredParticipants, ...participants].length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>No participants yet.</p>
              <p className="text-sm">Data will appear here as people register.</p>
            </div>
          )}

          {/* Additional admin info */}
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-bold text-yellow-800 mb-2">📱 Event Day Tips</h4>
            <div className="text-yellow-700 text-sm space-y-1">
              <p>• <strong>QR Scanner:</strong> Use for quick participant lookup and check-in</p>
              <p>• <strong>Offline Mode:</strong> Check-ins are saved locally if internet fails</p>
              <p>• <strong>Data Export:</strong> Download participant data anytime for backup</p>
              <p>• <strong>Real-time Sync:</strong> Stats update automatically across all devices</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // MAIN APP RENDER
  return (
    <div className="App">
      {/* QR Scanner Modal */}
      {showQRScanner && <QRScannerModal />}
      
      {/* Main Views */}
      {currentView === 'home' && <HomeView />}
      {currentView === 'register' && <RegistrationView />}
      {currentView === 'waiver' && <WaiverView />}
      {currentView === 'checkin' && <CheckInView />}
      {currentView === 'donation' && <DonationView />}
      {currentView === 'admin' && <AdminView />}
    </div>
  );
};

export default SangamamApp;
