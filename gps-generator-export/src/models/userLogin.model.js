import mongoose from "mongoose";

const userLoginSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, index: true },
    device_id: { type: String, required: true, index: true },
    vin: { type: String, default: null },
    device_type: { type: String, default: "mobile" },
    last_login_at: { type: Number, required: true },
    createdOn: { type: Number, required: true },
    updatedOn: { type: Number, required: true }
  },
  {
    collection: "user_logins"
  }
);

userLoginSchema.index({ user_id: 1, device_id: 1 }, { unique: true });

const UserLogin = mongoose.model("UserLogin", userLoginSchema);

export default UserLogin;
