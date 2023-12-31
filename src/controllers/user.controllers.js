import UserService from "../services/user.services.js";
import UserResponse from "../dao/dtos/user.response.js";
import CustomError from "../services/error/customeError.js";
import { generateUserErrorInfo } from "../services/error/errorMessages/user.creation.error.js";
import EErrors from "../services/error/errorsEnum.js";
import { createHash } from "../utils.js";
import { userModel } from "../dao/models/user.model.js";

class UserController {
  constructor() {
    this.userService = new UserService();
  }

  async register(req, res, next) {
    try {
      const {
        first_name,
        last_name,
        email,
        age,
        password,
        role,
        last_connection,
      } = req.body;

      if (!first_name || !email || !age || !password) {
        const customError = new CustomError({
          name: "User Creation Error",
          cause: generateUserErrorInfo({
            first_name,
            last_name,
            age,
            email,
            password,
            role,
          }),
          message: "Error tratando de crear el usuario",
          code: 400,
        });
        throw customError;
      }

      const response = await this.userService.registerUser({
        first_name,
        last_name,
        email,
        age,
        password,
        role,
        last_connection,
      });

      return res.status(200).json({
        status: response.status,
        data: response.user,
        redirect: response.redirect,
      });
    } catch (error) {
      if (error instanceof CustomError) {
        return res.status(error.code).json({
          status: "error",
          message: error.message,
        });
      } else {
        console.error(error);
        return res.status(500).json({
          status: "error",
          message: "Error interno del servidor",
        });
      }
    }
  }

  async restorePassword(req, res, next) {
    try {
      const { user, pass } = req.query;
      const passwordRestored = await this.userService.restorePassword(
        user,
        createHash(pass)
      );
      if (passwordRestored) {
        return res.send({
          status: "OK",
          message: "La contraseña se ha actualizado correctamente!",
        });
      } else {
        const customError = new CustomError({
          name: "Password Restoration Error",
          message: "No se pudo actualizar la contraseña",
          code: EErrors.PASSWORD_RESTORATION_ERROR,
        });
        return next(customError);
      }
    } catch (error) {
      console.error(error);
      return next(error);
    }
  }

  currentUser(req, res, next) {
    if (req.session.user) {
      return res.send({
        status: "OK",
        payload: new UserResponse(req.session.user),
      });
    } else {
      const customError = new CustomError({
        name: "Authorization Error",
        message: "No autorizado",
        code: EErrors.AUTHORIZATION_ERROR,
      });
      return next(customError);
    }
  }

  async updateUserDocuments(req, res) {
    try {
      const userId = req.params.uid;
      const file = req.file;

      if (!file) {
        return res.status(400).send("No file uploaded.");
      }

      const document = {
        name: file.originalname,
        string: file.path,
      };

      await userModel.findByIdAndUpdate(userId, {
        $push: { documents: document },
        $set: { last_connection: new Date() },
      });

      res.status(200).send("Document uploaded successfully.");
    } catch (error) {
      res.status(500).send(error.message);
    }
  }

  async uploadFiles(req, res) {
    try {
      const userId = req.params.uid;
      const files = req.files;
      const user = await userModel.findById(userId);

      if (!user) {
        return res.status(404).send("Usuario no encontrado.");
      }


      const addOrUpdateFile = (file, fileName) => {
        const existingIndex = user.documents.findIndex(
          (doc) => doc.name === fileName
        );
        const fileData = {
          name: fileName,
          reference: file.path,
          status: "Uploaded",
        };

        if (existingIndex >= 0) {
          user.documents[existingIndex] = fileData;
        } else {
          user.documents.push(fileData);
        }
      };

      if (files.profileImage && files.profileImage.length > 0) {
        addOrUpdateFile(files.profileImage[0], "profileImage");
      }

      if (files.productImage && files.productImage.length > 0) {
        addOrUpdateFile(files.productImage[0], "productImage");
      }

      if (files.document) {
        files.document.forEach((doc) => {
          addOrUpdateFile(doc, doc.originalname);
        });
      }

      await user.save();
      res.json({ message: "Files uploaded successfully." });
    } catch (error) {
      console.error("Error uploading files:", error);
      res.status(500).send("Error interno del servidor.");
    }
  }

  async upgradeToPremium(req, res) {
    try {
      const userId = req.params.uid;
      const user = await userModel.findById(userId);

      if (!user) {
        return res.status(404).send("Usuario no encontrado.");
      }

      const requiredDocs = [
        "identificationDocument",
        "domicileProofDocument",
        "accountStatementDocument",
      ];
      const hasAllDocuments = requiredDocs.every((docName) =>
        user.documents.some(
          (doc) => doc.name === docName && doc.status === "Uploaded"
        )
      );

      if (hasAllDocuments) {
        user.isPremium = true;
        user.role = "premium";
        await user.save();
        res.status(200).send("Cuenta actualizada a premium.");
      } else {
        res.status(400).send("Documentos requeridos no están completos.");
      }
    } catch (error) {
      console.error(error);
      res.status(500).send("Error interno del servidor.");
    }
  }

  async uploadPremiumDocuments(req, res) {
    console.log("uploadPremiumDocuments llamado", req.body);

    try {
      const userId = req.params.uid;
      const files = req.files;
      const user = await userModel.findById(userId);

      if (!user) {
        return res.status(404).send("Usuario no encontrado.");
      }


      const updateOrAddDocument = (docName, file) => {
        const existingDocIndex = user.documents.findIndex(
          (doc) => doc.name === docName
        );
        const documentData = {
          name: docName,
          reference: file.path,
          status: "Uploaded",
        };

        if (existingDocIndex >= 0) {
          user.documents[existingDocIndex] = documentData;
        } else {
          user.documents.push(documentData);
        }
      };


      if (files.identificationDocument) {
        updateOrAddDocument(
          "identificationDocument",
          files.identificationDocument[0]
        );
      }

      if (files.domicileProofDocument) {
        updateOrAddDocument(
          "domicileProofDocument",
          files.domicileProofDocument[0]
        );
      }

      if (files.accountStatementDocument) {
        updateOrAddDocument(
          "accountStatementDocument",
          files.accountStatementDocument[0]
        );
      }

      await user.save();
      res.json({ message: "Files uploaded successfully." });
    } catch (error) {
      console.error(error);
      res.status(500).send("Error interno del servidor.");
    }
  }
}

export default UserController;