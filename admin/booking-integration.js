// Admin Booking Integration
// Add this script to the booking.html page to integrate with admin system

function saveBookingToAdmin(bookingData) {
    // Send booking to server API
    fetch('/api/bookings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            customer_name: bookingData.name,
            customer_phone: bookingData.phone,
            customer_email: '', // Optional field
            service_name: bookingData.service, // Save actual service name
            booking_date: bookingData.date,
            booking_time: bookingData.time,
            notes: bookingData.notes
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Booking saved to admin dashboard:', data);
    })
    .catch(error => {
        console.error('Error saving booking:', error);
    });
}

// Enhanced booking validation function
function validateAndBookWhatsApp() {
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const service = document.getElementById('service').value;
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    const notes = document.getElementById('notes').value.trim();
    
    // Clear previous error styles
    document.querySelectorAll('.border-red-500').forEach(el => {
        el.classList.remove('border-red-500');
    });
    
    let hasError = false;
    
    // Validate required fields
    if (!name) {
        document.getElementById('name').classList.add('border-red-500');
        hasError = true;
    }
    if (!phone) {
        document.getElementById('phone').classList.add('border-red-500');
        hasError = true;
    }
    if (!service) {
        document.getElementById('service').classList.add('border-red-500');
        hasError = true;
    }
    if (!date) {
        document.getElementById('date').classList.add('border-red-500');
        hasError = true;
    }
    if (!time) {
        document.getElementById('time').classList.add('border-red-500');
        hasError = true;
    }
    
    if (hasError) {
        showToast('Please fill in all required fields (Name, Phone, Service, Date, and Time)', 'error');
        return;
    }
    
    // Save booking to admin system
    const bookingData = {
        name,
        phone,
        service,
        date,
        time,
        notes
    };
    
    saveBookingToAdmin(bookingData);
    
    // Create WhatsApp message
    const message = `Hello! I would like to book an appointment at Deny's Beauty World:\n\nName: ${name}\nPhone: ${phone}\nService: ${service}\nDate: ${date}\nTime: ${time}${notes ? `\nNotes: ${notes}` : ''}`;
    
    // Create WhatsApp URL
    const whatsappUrl = `https://wa.me/2348167559196?text=${encodeURIComponent(message)}`;
    
    // Show success message
    showToast('Booking submitted successfully! You will be redirected to WhatsApp in 5 seconds...', 'success');
    
    // Clear form
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('service').selectedIndex = 0;
    document.getElementById('date').value = '';
    document.getElementById('time').value = '';
    document.getElementById('notes').value = '';
    
    // Wait 5 seconds before opening WhatsApp
    setTimeout(() => {
        window.location.href = whatsappUrl;
    }, 5000);
}