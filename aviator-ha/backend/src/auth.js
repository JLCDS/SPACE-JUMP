import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserProfile, UserSession, createUserProfile } from './schemas.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura';
const JWT_EXPIRES_IN = '24h';

// ==== REGISTRO DE USUARIO ====
export async function registerUser(req, res) {
  try {
    const { username, password, email } = req.body;

    // Validaciones
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username y password son requeridos' 
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ 
        error: 'Username debe tener entre 3 y 20 caracteres' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password debe tener al menos 6 caracteres' 
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ 
        error: 'El username ya está en uso' 
      });
    }

    // Hash de la contraseña
    const password_hash = await bcrypt.hash(password, 12);

    // Crear usuario
    const user = await User.create({
      username,
      password_hash,
      email: email || null,
      is_active: true
    });

    // Crear perfil de usuario
    await createUserProfile(user._id);

    // Generar token JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Crear sesión
    await UserSession.create({
      session_id: generateSessionId(),
      user_id: user._id,
      ip_address: req.ip || req.connection.remoteAddress || 'unknown',
      is_active: true
    });

    res.status(201).json({
      ok: true,
      message: 'Usuario registrado exitosamente',
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      },
      token
    });

  } catch (error) {
    console.error('[Auth] Error en registro:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
}

// ==== LOGIN DE USUARIO ====
export async function loginUser(req, res) {
  try {
    const { username, password } = req.body;

    // Validaciones
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username y password son requeridos' 
      });
    }

    // Buscar usuario
    const user = await User.findOne({ username, is_active: true });
    if (!user) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    // Cerrar sesiones anteriores del usuario
    await UserSession.updateMany(
      { user_id: user._id, is_active: true },
      { is_active: false, logout_time: new Date() }
    );

    // Generar token JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Crear nueva sesión
    const sessionId = generateSessionId();
    await UserSession.create({
      session_id: sessionId,
      user_id: user._id,
      ip_address: req.ip || req.connection.remoteAddress || 'unknown',
      is_active: true
    });

    // Obtener perfil del usuario
    const profile = await UserProfile.findOne({ user_id: user._id });

    res.json({
      ok: true,
      message: 'Login exitoso',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profile: profile ? {
          balance: profile.balance,
          total_flights: profile.total_flights,
          total_profit: profile.total_profit,
          best_multiplier: profile.best_multiplier,
          games_played: profile.games_played,
          total_wagered: profile.total_wagered
        } : null
      },
      token,
      sessionId
    });

  } catch (error) {
    console.error('[Auth] Error en login:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
}

// ==== LOGOUT DE USUARIO ====
export async function logoutUser(req, res) {
  try {
    const { sessionId } = req.body;
    const userId = req.user?.userId; // Del middleware de autenticación

    if (sessionId) {
      await UserSession.updateOne(
        { session_id: sessionId, user_id: userId },
        { is_active: false, logout_time: new Date() }
      );
    } else {
      // Cerrar todas las sesiones del usuario
      await UserSession.updateMany(
        { user_id: userId, is_active: true },
        { is_active: false, logout_time: new Date() }
      );
    }

    res.json({
      ok: true,
      message: 'Logout exitoso'
    });

  } catch (error) {
    console.error('[Auth] Error en logout:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
}

// ==== MIDDLEWARE DE AUTENTICACIÓN ====
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Token de acceso requerido' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        error: 'Token inválido o expirado' 
      });
    }
    req.user = user;
    next();
  });
}

// ==== MIDDLEWARE OPCIONAL DE AUTENTICACIÓN ====
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
}

// ==== OBTENER PERFIL DEL USUARIO ====
export async function getUserProfile(req, res) {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId, { password_hash: 0 });
    if (!user) {
      return res.status(404).json({ 
        error: 'Usuario no encontrado' 
      });
    }

    const profile = await UserProfile.findOne({ user_id: userId });

    res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
        profile: profile ? {
          balance: profile.balance,
          total_flights: profile.total_flights,
          total_profit: profile.total_profit,
          best_multiplier: profile.best_multiplier,
          games_played: profile.games_played,
          total_wagered: profile.total_wagered
        } : null
      }
    });

  } catch (error) {
    console.error('[Auth] Error obteniendo perfil:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
}

// ==== FUNCIONES AUXILIARES ====
function generateSessionId() {
  return Math.random().toString(36).substring(2) + 
         Date.now().toString(36) + 
         Math.random().toString(36).substring(2);
}

// ==== VALIDAR SESIÓN ACTIVA ====
export async function validateSession(sessionId, userId) {
  try {
    const session = await UserSession.findOne({
      session_id: sessionId,
      user_id: userId,
      is_active: true
    });
    return !!session;
  } catch (error) {
    console.error('[Auth] Error validando sesión:', error);
    return false;
  }
}